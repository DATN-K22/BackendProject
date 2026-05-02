import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateFileDto, ResourceType } from './dto/request/create-file.dto';
import { FileRepository } from './file.repository';
import { ICDNService } from '../cloud-provider/cdn/cdn.interface';
import { ICloudStorageService } from '../cloud-provider/storage/cloud-storage.interface';
import { IMessageBroker } from '../message-broker/message-broker.interface';
import { MESSAGE_BROKER } from '../message-broker/message-broker.token';
import { CDN_SERVICE, CLOUD_STORAGE_SERVICE } from '../../config/constant';

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

  async create(createFileDto: CreateFileDto) {
    const chapterItemId = createFileDto.chapter_item_id ?? createFileDto.lesson_id;
    const resourceOwnerId = chapterItemId ?? createFileDto.course_id;

    if (!resourceOwnerId) {
      throw new BadRequestException('Either chapter_item_id or course_id must be provided');
    }

    const { path, filename } = this.buildPathAndFilename(createFileDto, resourceOwnerId);

    const file = await this.fileRepository.create(createFileDto, path, filename);

    const url = await this.cloudStorageService.getPresignedUrlForAccessing(this.bucketName, `${path}/${filename}`);

    await this.messageBroker.sendFileUrlForAIProcessing(file.id, url, `course_${createFileDto.course_id}`);

    return file;
  }

  async remove(id: number) {
    const file = await this.fileRepository.findById(id);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (!file.link) {
      throw new BadRequestException('Invalid file URL');
    }

    const key = this.cloudStorageService.extractKeyFromUrl(file.link);

    try {
      await this.cloudStorageService.deleteFile(this.bucketName, key);
    } catch (err) {
      this.logger.error('Delete S3 failed', err);
      throw new InternalServerErrorException('Delete file failed');
    }

    await this.fileRepository.deleteById(id);

    return { success: true };
  }

  getPresignedUrlForS3Uploading(filename: string, courseId: string, chapterItemId: string) {
    const ext = filename.split('.').pop()?.toLowerCase();

    const map: Record<string, { contentType: string; prefix: string }> = {
      jpg: { contentType: 'image/jpg', prefix: 'images' },
      jpeg: { contentType: 'image/jpeg', prefix: 'images' },
      png: { contentType: 'image/png', prefix: 'images' },
      mp4: { contentType: 'video/mp4', prefix: 'videos' },
      pdf: { contentType: 'application/pdf', prefix: 'documents' }
    };

    const config = ext ? map[ext] : null;

    if (!config) {
      throw new BadRequestException('Unsupported file type');
    }

    const key = `${config.prefix}/${courseId}/${chapterItemId}/${filename}`;

    return this.cloudStorageService.getPresignedUrl(this.bucketName, key, config.contentType);
  }

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

  // ================= PRIVATE =================

  private buildPathAndFilename(createFileDto: CreateFileDto, resourceOwnerId: string) {
    switch (createFileDto.type) {
      case ResourceType.VIDEO:
        return {
          path: `videos/${createFileDto.course_id}/${resourceOwnerId}`,
          filename: createFileDto.filename.split('.').slice(0, -1).join('.') + '_hls.m3u8'
        };

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

        return {
          ...item,
          link
        };
      })
    );
  }
}
