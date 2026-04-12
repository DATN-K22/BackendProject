import { Module } from '@nestjs/common';
import { FileService } from './file.service';
import { FileController } from './file.controller';
import { FileRepository } from './file.repository';
import { CloudStorageModule } from '../cloud/cloud.module';

@Module({
  imports: [CloudStorageModule],
  controllers: [FileController],
  providers: [FileService, FileRepository]
})
export class FileModule {}
