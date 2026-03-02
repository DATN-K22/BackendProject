import { Module } from '@nestjs/common'
import { CourseController } from './course.controller'
import { CourseService } from './course.service'
import { CourseRepositoy } from './course.repository'
import { IamModule } from '../iam/iam.module'

@Module({
  imports: [IamModule],
  controllers: [CourseController],
  providers: [CourseService, CourseRepositoy],
  exports: [CourseService]
})
export class CourseModule {}
