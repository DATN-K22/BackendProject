import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { CourseRepositoy } from './course.repository';

@Module({
  controllers: [CourseController],
  providers: [CourseService, CourseRepositoy]
})
export class CourseModule {}
