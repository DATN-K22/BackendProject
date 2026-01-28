import { Module } from '@nestjs/common';
import { FileService } from './file.service';
import { FileController } from './file.controller';
import { CloudStorageModule } from '../cloud.storage/cloud-storage.module';
import { FileRepository } from './file.repository'

@Module({
  imports: [CloudStorageModule, CloudStorageModule],
  controllers: [FileController],
  providers: [FileService, FileRepository],
})
export class FileModule {}
