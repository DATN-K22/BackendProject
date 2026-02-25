import { Injectable } from '@nestjs/common';
import { CourseRepositoy } from './course.repository';
import { UpdateCourseDto } from './dto/request/update-course.dto';
import { CreateCourseDto } from './dto/request/create-course.dto';

@Injectable()
export class CourseService {
  constructor(private readonly courseRepository: CourseRepositoy) {}

  async create(createCourseDto: CreateCourseDto) {
    return this.courseRepository.create(createCourseDto);
  }

  // async findAll(offset: number, limit: number) {
  //   return this.courseRepository.findAll(offset, limit);
  // }

  async getTopRatingCourse(offset: number, limit: number) {
    return this.courseRepository.getTopRatingCourse(offset, limit);
  }

  async getLatestIncompleteCourseForUser(userId: string) {
    // get latest incomplete course list for user
    // Don't have the progress field in course table, so we need to get the progress from enrollment table and filter the courses that have progress < 100%
    // get creator of each course and return with creator info
    return this.courseRepository.getLatestIncompleteCourseForUser(userId);
  }

  findOne(id: number) {
    return `This action returns a #${id} course`;
  }

  update(id: number, updateCourseDto: UpdateCourseDto) {
    return this.courseRepository.update(updateCourseDto, id);
  }

  remove(id: number) {
    return `This action removes a #${id} course`;
  }
}
