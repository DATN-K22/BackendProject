import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'

@Injectable()
export class LessonRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(dto: CreateLessonDto) {
    return this.prismaService.lesson.create({
      data: {
        ...dto,
        chapter_id: BigInt(dto.chapter_id),
        resources: dto.resources ? dto.resources.map((r) => BigInt(r)) : []
      }
    })
  }

  findAll(params: { skip?: number; take?: number; chapterId?: bigint }) {
    const { skip, take, chapterId } = params
    return this.prismaService.lesson.findMany({
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
  async getLessonByIdWithValidateUserEnrollment(lessonId: string, userId: string) {
    const lesson = await this.prismaService.lesson.findUnique({
      where: { id: BigInt(lessonId) },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        short_description: true,
        long_description: true,
        chapter: {
          include: {
            course: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },

        lessonStatuses: {
          where: { user_id: userId },
          select: { id: true }
        }
      }
    })

    if (!lesson) return null

    if (!this.isEnrolled(lesson.chapter.course_id.toString(), userId)) return null

    return {
      is: lesson.id,
      title: lesson.title,
      status: lesson.status,
      type: lesson.type,
      short_description: lesson.short_description,
      long_description: lesson.long_description,
      isFinished: lesson.lessonStatuses.length > 0
    }
  }

  async isEnrolled(courseId: string, userId: string) {
    const enrollment = await this.prismaService.enrollment.findFirst({
      where: {
        user_id: userId,
        course_id: BigInt(courseId)
      },
      select: { id: true }
    })

    if (!enrollment) return false
    else return true
  }

  update(id: string, dto: UpdateLessonDto) {
    const data: any = { ...dto }

    if (dto.chapter_id) {
      data.chapter_id = BigInt(dto.chapter_id)
    }

    if (dto.resources) {
      data.resources = dto.resources.map((r) => BigInt(r))
    }

    return this.prismaService.lesson.update({
      where: { id: BigInt(id) },
      data
    })
  }

  async markLearnedLesson(userId: string, lessonId: string) {
    return this.prismaService.lessonStatus.create({
      data: {
        user_id: userId,
        lesson_id: BigInt(lessonId),
        updated_at: new Date()
      }
    })
  }

  remove(id: string) {
    return this.prismaService.lesson.delete({
      where: { id: BigInt(id) }
    })
  }
}
