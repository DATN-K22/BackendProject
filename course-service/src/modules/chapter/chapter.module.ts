import { Module } from '@nestjs/common'
import { ChapterController } from './chapter.controller'
import { ChapterService } from './chapter.service'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  controllers: [ChapterController],
  providers: [ChapterService, PrismaService],
  exports: [ChapterService]
})
export class ChapterModule {}
