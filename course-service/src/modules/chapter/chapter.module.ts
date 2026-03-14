import { Module } from '@nestjs/common'
import { ChapterController } from './chapter.controller'
import { ChapterService } from './chapter.service'
import { PrismaService } from '../prisma/prisma.service'
import { ChapterRepository } from './chaper.repository'
import { LessonModule } from '../lesson/lesson.module'

@Module({
  imports: [LessonModule],
  controllers: [ChapterController],
  providers: [ChapterService, PrismaService, ChapterRepository],
  exports: [ChapterService]
})
export class ChapterModule {}
