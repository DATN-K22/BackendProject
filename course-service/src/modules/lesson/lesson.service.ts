import { Injectable } from '@nestjs/common'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class LessonService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLessonDto) {
    return this.prisma.lesson.create({
      data: {
        ...dto,
        chapter_id: BigInt(dto.chapter_id),
        resources: dto.resources ? dto.resources.map((r) => BigInt(r)) : []
      }
    })
  }

  findAll(params: { skip?: number; take?: number; chapterId?: bigint }) {
    const { skip, take, chapterId } = params
    return this.prisma.lesson.findMany({
      skip,
      take,
      where: chapterId ? { chapter_id: chapterId } : undefined,
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            course_id: true
          }
        }
      }
    })
  }

  findOne(id: string) {
    return this.prisma.lesson.findUnique({
      where: { id: BigInt(id) },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            course_id: true
          }
        }
      }
    })
  }

  update(id: string, dto: UpdateLessonDto) {
    const data: any = { ...dto }

    if (dto.chapter_id) {
      data.chapter_id = BigInt(dto.chapter_id)
    }

    if (dto.resources) {
      data.resources = dto.resources.map((r) => BigInt(r))
    }

    return this.prisma.lesson.update({
      where: { id: BigInt(id) },
      data
    })
  }

  remove(id: string) {
    return this.prisma.lesson.delete({
      where: { id: BigInt(id) }
    })
  }
}
