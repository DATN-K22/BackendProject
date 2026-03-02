import { Module } from '@nestjs/common'
import { ChapterController } from './chapter.controller'
import { ChapterService } from './chapter.service'
import { PrismaService } from '../prisma/prisma.service'
import { ChapterRepository } from './chaper.repository'

@Module({
  controllers: [ChapterController],
  providers: [ChapterService, PrismaService, ChapterRepository],
  exports: [ChapterService]
})
export class ChapterModule {}
