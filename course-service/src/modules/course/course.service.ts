import { Injectable } from '@nestjs/common'
import { CreateCourseDto } from './dto/create-course.dto'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateCourseDto } from './dto/update-course.dto'

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        ...dto
      }
    })
  }

  findAll(params: { skip?: number; take?: number }) {
    const { skip, take } = params
    return this.prisma.course.findMany({
      skip,
      take,
      orderBy: { created_at: 'desc' }
    })
  }

  findOne(id: string) {
    return this.prisma.course.findUnique({
      where: { id: BigInt(id) }
    })
  }

  update(id: string, dto: UpdateCourseDto) {
    return this.prisma.course.update({
      where: { id: BigInt(id) },
      data: {
        ...dto
      }
    })
  }

  remove(id: string) {
    return this.prisma.course.delete({
      where: { id: BigInt(id) }
    })
  }
}
