import { Injectable } from '@nestjs/common'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateChapterDto } from './dto/update-chapter.dto'

@Injectable()
export class ChapterService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateChapterDto) {
    return this.prisma.chapter.create({
      data: {
        ...dto,
        course_id: dto.course_id ? BigInt(dto.course_id) : null,
        resource_id: dto.resource_id ? BigInt(dto.resource_id) : null
      }
    })
  }

  findAll(params: { skip?: number; take?: number; courseId?: bigint }) {
    const { skip, take, courseId } = params
    return this.prisma.chapter.findMany({
      skip,
      take,
      where: courseId ? { course_id: courseId } : undefined,
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        lessons: {
          orderBy: { sort_order: 'asc' }
        }
      }
    })
  }

  findOne(id: string) {
    return this.prisma.chapter.findUnique({
      where: { id: BigInt(id) },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        lessons: {
          orderBy: { sort_order: 'asc' }
        }
      }
    })
  }

  update(id: string, dto: UpdateChapterDto) {
    return this.prisma.chapter.update({
      where: { id: BigInt(id) },
      data: {
        ...dto,
        course_id: dto.course_id ? BigInt(dto.course_id) : undefined,
        resource_id: dto.resource_id ? BigInt(dto.resource_id) : undefined
      }
    })
  }

  remove(id: string) {
    return this.prisma.chapter.delete({
      where: { id: BigInt(id) }
    })
  }
}
