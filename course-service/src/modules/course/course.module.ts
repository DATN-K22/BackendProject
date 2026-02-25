import { Module } from '@nestjs/common'
import { CourseController } from './course.controller'
import { CourseService } from './course.service'
import { PrismaService } from '../prisma/prisma.service'
import { CourseRepositoy } from './course.repository'

@Module({
  controllers: [CourseController],
  providers: [CourseService, CourseRepositoy],
  exports: [CourseService]
})
export class CourseModule {}
