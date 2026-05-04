import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompleteVideoUploadDto,
  CreateFileDto,
  CreateFilesDto,
  GetPresignedUrlsDto,
  InitVideoUploadDto,
  ResourceType
} from './dto/request/create-file.dto';
import { FileRepository } from './file.repository';
import { ICDNService } from '../cloud-provider/cdn/cdn.interface';
import { ICloudStorageService, UploadedPart } from '../cloud-provider/storage/cloud-storage.interface';
import { IMessageBroker } from '../message-broker/message-broker.interface';
import { MESSAGE_BROKER } from '../message-broker/message-broker.token';
import { CDN_SERVICE, CLOUD_STORAGE_SERVICE } from '../../config/constant';

const PART_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_VIDEO_CONTENT_TYPE = 'video/mp4';
const ALLOWED_DOC_CONTENT_TYPE = 'application/pdf';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly bucketName: string;

  constructor(
    @Inject(CLOUD_STORAGE_SERVICE)
    private readonly cloudStorageService: ICloudStorageService,

    @Inject(CDN_SERVICE)
    private readonly cdnService: ICDNService,

    private readonly configService: ConfigService,
    private readonly fileRepository: FileRepository,

    @Inject(MESSAGE_BROKER)
    private readonly messageBroker: IMessageBroker
  ) {
    this.bucketName = this.configService.get<string>('AWS_S3_INPUT_BUCKET', 'default-bucket');
    this.logger.debug(`Initializing FileService with bucket: ${this.bucketName}`);
  }

  // ── Documents / Images ─────────────────────────────────────────────────────

  async create(createFileDto: CreateFileDto) {
    const chapterItemId = createFileDto.chapter_item_id ?? createFileDto.lesson_id;
    const resourceOwnerId = chapterItemId ?? createFileDto.course_id;

    if (!resourceOwnerId) {
      throw new BadRequestException('Either chapter_item_id or course_id must be provided');
    }

    if (createFileDto.type === ResourceType.VIDEO) {
      throw new BadRequestException('Use POST /files/video/init for video uploads');
    }

    const { path, filename } = this.buildPathAndFilename(createFileDto, resourceOwnerId);
    const file = await this.fileRepository.create(createFileDto, path, filename);
    const url = await this.cloudStorageService.getPresignedUrlForAccessing(this.bucketName, `${path}/${filename}`);
    await this.messageBroker.sendFileUrlForAIProcessing(file.id, url, `course_${createFileDto.course_id}`);

    return file;
  }

  async createMany(createFilesDto: CreateFilesDto) {
    const hasVideo = createFilesDto.files.some((f) => f.type === ResourceType.VIDEO);
    if (hasVideo) {
      throw new BadRequestException('Use POST /files/video/init for video uploads');
    }

    return Promise.all(createFilesDto.files.map((dto) => this.create(dto)));
  }

  async generatePresignedUrls(dto: GetPresignedUrlsDto) {
    const resourceOwnerId = dto.chapterItemId ?? dto.lessonId;
    if (!resourceOwnerId) {
      throw new BadRequestException('Either chapterItemId or lessonId must be provided');
    }

    const hasVideo = dto.files.some((f) => f.contentType === ALLOWED_VIDEO_CONTENT_TYPE);
    if (hasVideo) {
      throw new BadRequestException('Use POST /files/video/init for video uploads');
    }

    const CONTENT_TYPE_PREFIX_MAP: Record<string, string> = {
      'image/jpg': 'images',
      'image/jpeg': 'images',
      'image/png': 'images',
      'application/pdf': 'documents'
    };

    return Promise.all(
      dto.files.map(async ({ filename, contentType }) => {
        const prefix = CONTENT_TYPE_PREFIX_MAP[contentType];
        if (!prefix) {
          throw new BadRequestException(`Unsupported content type: ${contentType}`);
        }

        const safeFilename = this.formatFilename(filename);
        const key = `${prefix}/${dto.courseId}/${resourceOwnerId}/${safeFilename}`;
        const presignedUrl = await this.cloudStorageService.getPresignedUrl(this.bucketName, key, contentType, 900);

        return {
          filename: safeFilename,
          contentType,
          key,
          presignedUrl,
          expiresAt: new Date(Date.now() + 900 * 1000)
        };
      })
    );
  }

  async remove(id: number) {
    const file = await this.fileRepository.findById(id);
    if (!file) throw new NotFoundException('File not found');

    const key = file.path + '/' + file.filename;

    try {
      await this.cloudStorageService.deleteFile(this.bucketName, key);
    } catch (err) {
      this.logger.error('Delete S3 failed', err);
      throw new InternalServerErrorException('Delete file failed');
    }

    await this.fileRepository.deleteById(id);
    return { success: true };
  }

  // ── Video Multipart Upload ─────────────────────────────────────────────────

  async initVideoUpload(dto: InitVideoUploadDto) {
    const key = `videos/${dto.courseId}/${dto.lessonId}/main.mp4`;
    const totalParts = Math.ceil(dto.fileSize / PART_SIZE_BYTES);

    // Idempotent: check for existing incomplete upload session in DB
    const existing = await this.fileRepository.findActiveUploadSession(dto.lessonId);
    if (existing) {
      this.logger.log(`Reusing upload session for lessonId=${dto.lessonId}`);
      return {
        uploadId: existing.uploadId,
        key: existing.key,
        totalParts: existing.totalParts,
        partSize: PART_SIZE_BYTES
      };
    }

    // Enforce 1 video per lesson
    const existingVideo = await this.fileRepository.findVideoByLessonId(dto.lessonId);
    if (existingVideo) {
      throw new ConflictException(`Lesson ${dto.lessonId} already has a video`);
    }

    const { uploadId } = await this.cloudStorageService.createMultipartUpload(
      this.bucketName,
      key,
      ALLOWED_VIDEO_CONTENT_TYPE
    );

    const resource = await this.fileRepository.createVideoResource({
      title: dto.title,
      courseId: dto.courseId,
      lessonId: dto.lessonId,
      key,
      uploadId,
      totalParts
    });

    this.logger.log(`Initiated multipart upload: ${uploadId} for lessonId=${dto.lessonId}`);

    return { uploadId, key, totalParts, partSize: PART_SIZE_BYTES };
  }

  async getPartPresignedUrl(uploadId: string, partNumber: number) {
    const session = await this.fileRepository.findUploadSessionByUploadId(uploadId);
    if (!session) throw new NotFoundException(`Upload session not found: ${uploadId}`);
    if (session.status === 'COMPLETED') throw new ConflictException('Upload already completed');

    const expiresIn = 3600; // 1h per part — enough for large chunk upload
    const presignedUrl = await this.cloudStorageService.getPresignedUrlForPart(
      this.bucketName,
      session.key,
      uploadId,
      partNumber,
      expiresIn
    );

    await this.fileRepository.updateUploadSessionStatus(uploadId, 'IN_PROGRESS');

    return {
      partNumber,
      presignedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };
  }

  async listUploadedParts(uploadId: string) {
    const session = await this.fileRepository.findUploadSessionByUploadId(uploadId);
    if (!session) throw new NotFoundException(`Upload session not found: ${uploadId}`);

    // S3 is the source of truth for which parts actually landed
    const s3Parts = await this.cloudStorageService.listUploadedParts(this.bucketName, session.key, uploadId);

    const uploadedNumbers = new Set(s3Parts.map((p) => p.partNumber));
    const missingParts = Array.from({ length: session.totalParts }, (_, i) => i + 1).filter(
      (n) => !uploadedNumbers.has(n)
    );

    return { uploadedParts: s3Parts, missingParts };
  }

  async completeVideoUpload(uploadId: string, dto: CompleteVideoUploadDto) {
    const session = await this.fileRepository.findUploadSessionByUploadId(uploadId);
    if (!session) throw new NotFoundException(`Upload session not found: ${uploadId}`);
    if (session.status === 'COMPLETED') throw new ConflictException('Upload already completed');

    const parts: UploadedPart[] = dto.parts.map((p) => ({
      partNumber: p.partNumber,
      etag: p.etag
    }));

    await this.cloudStorageService.completeMultipartUpload(this.bucketName, session.key, uploadId, parts);

    await this.fileRepository.finalizeVideoUpload(uploadId, session.resourceId);

    return { resourceId: session.resourceId };
  }

  // ── Resources Query ────────────────────────────────────────────────────────

  async findResourcesByChapterItemId(chapterItemId: string) {
    const resources = await this.fileRepository.findResourcesByChapterItemId(chapterItemId);
    this.logger.debug(`Found ${resources.length} resources for chapterItemId=${chapterItemId}`);

    const resourcesWithUrl = await this.getContentsPresignedUrl(resources);

    return {
      document: resourcesWithUrl.filter((r) => r.type === 'document'),
      video: resourcesWithUrl.filter((r) => r.type === 'video'),
      image: resourcesWithUrl.filter((r) => r.type === 'image')
    };
  }

  async findResourcesByLessonId(lessonId: string) {
    return this.findResourcesByChapterItemId(lessonId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildPathAndFilename(createFileDto: CreateFileDto, resourceOwnerId: string) {
    switch (createFileDto.type) {
      case ResourceType.DOCUMENT:
        return {
          path: `documents/${createFileDto.course_id}/${resourceOwnerId}`,
          filename: createFileDto.filename
        };
      case ResourceType.IMAGE:
        return {
          path: `images/${createFileDto.course_id}/${resourceOwnerId}`,
          filename: createFileDto.filename
        };
      default:
        throw new BadRequestException('Unsupported resource type');
    }
  }

  private async getContentsPresignedUrl(resources: any[]) {
    return Promise.all(
      resources.map(async (item) => {
        const link = await this.cdnService.getPresignedUrlForCloudFront(item.path, item.filename, 3600);
        return { ...item, link };
      })
    );
  }

  private formatFilename(original: string): string {
    const ext = original.includes('.') ? original.split('.').pop() : '';
    const name = original.replace(/\.[^/.]+$/, '');

    const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    const slug = normalized
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const timestamp = Date.now();

    return ext ? `${timestamp}-${slug}.${ext}` : `${timestamp}-${slug}`;
  }
}
