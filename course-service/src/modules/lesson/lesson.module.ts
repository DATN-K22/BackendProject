import { Module } from '@nestjs/common'
import { LessonController } from './lesson.controller'
import { LessonService } from './lesson.service'
import { LessonRepository } from './lesson.repository'
import { MediaModule } from '../media-service/media.module'

@Module({
  imports: [MediaModule],
  controllers: [LessonController],
  providers: [LessonService, LessonRepository],
  exports: [LessonService]
})
export class LessonModule {}
