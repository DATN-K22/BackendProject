import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ICloudStorageService } from '../cloud.storage/ICloudStorageService';
import { CLOUD_STORAGE_SERVICE } from 'src/config/constant';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/utils/excreption/AppException';
import { ErrorCode } from 'src/utils/excreption/ErrorCode';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly bucketName: string;

  constructor(
    @Inject(CLOUD_STORAGE_SERVICE)
    private readonly cloudStorageService: ICloudStorageService,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET', 'default-bucket');
  }


  create(createFileDto: CreateFileDto) {
    return 'This action adds a new file';
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

  remove(id: number) {
    return `This action removes a #${id} file`;
  }

  getPresignedUrl(key: string) {
    var contentType = "";
    switch (key.split('.').pop()?.toLowerCase()) {
      case 'jpg': 
        contentType = 'image/jpg'; break;
      case 'jpeg':
        contentType = 'image/jpeg'; break;
      case 'png':
        contentType = 'image/png'; break;
      case 'mp4':
        contentType = 'video/mp4'; break;
      default:
        throw new AppException(ErrorCode.UNSUPORTED_FILE_TYPE, true)
    }
    return this.cloudStorageService.getPresignedUrl(this.bucketName, key, contentType); 
  }
}
