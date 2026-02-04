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

  async findAll(offset: number, limit: number) {
    return this.courseRepository.findAll(offset, limit);
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
