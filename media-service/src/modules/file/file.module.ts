import { Module } from '@nestjs/common';
import { FileService } from './file.service';
import { FileController } from './file.controller';
import { CloudStorageModule } from '../cloud.storage/cloud-storage.module';

@Module({
  imports: [CloudStorageModule, CloudStorageModule],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
