import { Module } from '@nestjs/common';
import { LabService } from './lab.service';
import { LabController } from './lab.controller';
import { MediaModule } from '../media-service/media.module';
import { LabRepository } from './lab.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { AwsService } from './aws';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [LabController],
  providers: [LabService, AwsService, LabRepository],
})
export class LabModule {}
