import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { CDN_SERVICE, CLOUD_STORAGE_SERVICE } from 'src/config/constant';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/utils/excreption/AppException';
import { ErrorCode } from 'src/utils/excreption/ErrorCode';
import { CreateFileDto, ResourceType } from './dto/request/create-file.dto';
import { UpdateFileDto } from './dto/request/update-file.dto';
import { FileRepository } from './file.repository';
import { Resource } from 'generated/prisma/client';
import { ICDNService } from '../cloud/cdn.interface';
import { ICloudStorageService } from '../cloud/cloud-storage.interface';

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
    private readonly fileRepository: FileRepository
  ) {
    this.bucketName = this.configService.get<string>('AWS_S3_INPUT_BUCKET', 'default-bucket');
    Logger.debug(`Initializing FileService with bucket: ${this.bucketName}`);
  }

  async create(createFileDto: CreateFileDto) {
    if (!createFileDto.lesson_id && !createFileDto.course_id) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, true, 'Either lesson_id or course_id must be provided');
    }
    var path = '';
    var filename = '';
    switch (createFileDto.type) {
      case ResourceType.VIDEO:
        path = `videos/${createFileDto.course_id}/${createFileDto.lesson_id}`;
        filename = createFileDto.filename.split('.').slice(0, -1).join('.') + '_hls.m3u8';
        break;
      case ResourceType.DOCUMENT:
        path = `documents/${createFileDto.course_id}/${createFileDto.lesson_id}`;
        filename = createFileDto.filename;
        break;
      case ResourceType.IMAGE:
        path = `images/${createFileDto.course_id}/${createFileDto.lesson_id}`;
        filename = createFileDto.filename;
        break;
      default:
        throw new BadRequestException('Unsupported resource type');
    }
    const response = this.fileRepository.create(createFileDto, path, filename);
    return response;
  }

  async remove(id: number) {
    const file = await this.fileRepository.findById(id);

    if (!file) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, true);
    }

    if (!file.link) {
      throw new AppException(ErrorCode.INVALID_FILE_URL, true);
    }

    const key = this.cloudStorageService.extractKeyFromUrl(file.link);
    try {
      await this.cloudStorageService.deleteFile(this.bucketName, key);
    } catch (err) {
      this.logger.error('Delete S3 failed', err);
      throw new AppException(ErrorCode.DELETE_FILE_FAILED, true);
    }

    await this.fileRepository.deleteById(id);
    return { success: true };
  }

  getPresignedUrlForS3Uploading(filename: string, courseId: string, lessonId: string) {
    var contentType = '';
    var key = '';
    Logger.debug(`Generating presigned URL for file: ${filename}, courseId: ${courseId}, lessonId: ${lessonId}`);
    switch (filename.split('.').pop()?.toLowerCase()) {
      case 'jpg':
        contentType = 'image/jpg';
        key = `images/${courseId}/${lessonId}/${filename}`;
        break;
      case 'jpeg':
        contentType = 'image/jpeg';
        key = `images/${courseId}/${lessonId}/${filename}`;
        break;
      case 'png':
        contentType = 'image/png';
        key = `images/${courseId}/${lessonId}/${filename}`;
        break;
      case 'mp4':
        contentType = 'video/mp4';
        key = `videos/${courseId}/${lessonId}/${filename}`;
        break;

      case 'pdf':
        contentType = 'application/pdf';
        key = `documents/${courseId}/${lessonId}/${filename}`;
        break;
      default:
        throw new AppException(ErrorCode.UNSUPORTED_FILE_TYPE, true);
    }
    return this.cloudStorageService.getPresignedUrl(this.bucketName, key, contentType);
  }

  async findResourcesByLessonId(lessonId: string) {
    const resources = await this.fileRepository.findResourcesByLessonId(lessonId);
    const resourcesWithUrl = await this.getContentsPresignedUrl(resources);
    const result: { document: typeof resources; video: typeof resources; image: typeof resources } = {
      document: [],
      video: [],
      image: []
    };

    resourcesWithUrl.forEach((resource) => {
      if (resource.type === 'document') {
        result.document.push(resource);
      } else if (resource.type === 'video') {
        result.video.push(resource);
      } else {
        result.image.push(resource);
      }
    });

    return result;
  }

  /****
   * Helper method to get presigned URLs for a list of resources.
   * This is used to generate accessible links for the FE.
   * It calls the CDN service to get presigned URLs for each resource based on their S3 keys.
   ****/
  private async getContentsPresignedUrl(resources: Resource[]) {
    const promises = resources.map(async (item) => {
      const link = await this.cdnService.getPresignedUrlForCloudFront(item.path, item.filename, 3600);
      return {
        ...item,
        link
      };
    });
    return Promise.all(promises);
  }
}
