import { Inject, Injectable, Logger } from '@nestjs/common';
import { ICloudStorageService } from '../cloud.storage/ICloudStorageService';
import { CLOUD_STORAGE_SERVICE } from 'src/config/constant';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/utils/excreption/AppException';
import { ErrorCode } from 'src/utils/excreption/ErrorCode';
import { CreateFileDto, ResourceType } from './dto/request/create-file.dto';
import { UpdateFileDto } from './dto/request/update-file.dto';
import { FileRepository } from './file.repository';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly bucketName: string;

  constructor(
    @Inject(CLOUD_STORAGE_SERVICE)
    private readonly cloudStorageService: ICloudStorageService,
    private readonly configService: ConfigService,
    private readonly fileRepository: FileRepository,
  ) {
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET',
      'default-bucket',
    );
  }

  async create(createFileDto: CreateFileDto) {
    if (createFileDto.type === ResourceType.VIDEO) {
    }
    const response = this.fileRepository.create(createFileDto);
    return response;
  }

  findAll() {
    return `This action returns all file`;
  }

  findOne(id: number) {
    return `This action returns a #${id} file`;
  }

  update(id: number, updateFileDto: UpdateFileDto) {
    return `This action updates a #${id} file`;
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

  getPresignedUrl(key: string) {
    var contentType = '';
    switch (key.split('.').pop()?.toLowerCase()) {
      case 'jpg':
        contentType = 'image/jpg';
        break;
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'mp4':
        contentType = 'video/mp4';
        break;
      default:
        throw new AppException(ErrorCode.UNSUPORTED_FILE_TYPE, true);
    }
    return this.cloudStorageService.getPresignedUrl(
      this.bucketName,
      key,
      contentType,
    );
  }
}
