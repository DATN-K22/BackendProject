import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/request/create-course.dto';
import { UpdateCourseDto } from './dto/request/update-course.dto';

@Injectable()
export class CourseRepositoy {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createCourseDto: CreateCourseDto) {
    const record = await this.prismaService.course.create({
      data: {
        owner_id: createCourseDto.owner_id,
        title: createCourseDto.title,
        short_description: createCourseDto.short_description,
        long_description: createCourseDto.long_description,
        thumbnail_url: createCourseDto.thumbnail_url,
        price: createCourseDto.price,
        status: createCourseDto.status as any
      }
    });
    return {
      ...record,
      id: record.id.toString()
    };
  }

  async update(updateCourseDto: UpdateCourseDto, courseId: number) {
    const record = await this.prismaService.course.update({
      data: updateCourseDto,
      where: { id: courseId }
    });
    return {
      ...record,
      id: record.id.toString()
    };
  }

  async findAll(offset: number, limit: number) {
    const [courses, totalItems] = await Promise.all([
      this.prismaService.course.findMany({
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' }
      }),
      this.prismaService.course.count()
    ]);
    return {
      courses,
      page: {
        total_pages: Math.ceil(totalItems / limit),
        total_items: totalItems,
        offset: offset,
        limit: limit
      }
    };
  }
}
