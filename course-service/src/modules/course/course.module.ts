import { Module } from '@nestjs/common'
import { CourseController } from './course.controller'
import { CourseService } from './course.service'
import { CourseRepositoy } from './course.repository'
import { CourseTool } from './course.tool'
import { IamModule } from '../iam-service/iam.module'
import { ChapterModule } from '../chapter/chapter.module'
import { LessonModule } from '../lesson/lesson.module'
import { McpModule } from '@rekog/mcp-nest'
import { QuizModule } from '../quiz/quiz.module'
import { LabModule } from '../lab/lab.module'

@Module({
  imports: [IamModule, ChapterModule, LessonModule, QuizModule, LabModule, McpModule.forFeature([CourseTool], 'course-mcp')],
  controllers: [CourseController],
  providers: [CourseService, CourseRepositoy, CourseTool]
})
export class CourseModule {}
