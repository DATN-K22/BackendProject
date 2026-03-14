import { Module } from '@nestjs/common'
import { CourseController } from './course.controller'
import { CourseService } from './course.service'
import { CourseRepositoy } from './course.repository'
import { IamModule } from '../iam-service/iam.module'
import { ChapterModule } from '../chapter/chapter.module'

@Module({
  imports: [IamModule, ChapterModule],
  controllers: [CourseController],
  providers: [CourseService, CourseRepositoy],
  exports: [CourseService]
})
export class CourseModule {}
