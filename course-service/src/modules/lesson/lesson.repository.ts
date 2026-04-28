import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'

@Injectable()
export class LessonRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(dto: CreateLessonDto) {
    return this.prismaService.$transaction(async (tx) => {
      const chapterId = BigInt(dto.chapter_id)
      const lesson = await tx.lesson.create({
        data: {
          title: dto.title,
          short_description: dto.short_description,
          long_description: dto.long_description,
          thumbnail_url: dto.thumbnail_url,
          status: dto.status,
          duration: dto.duration ?? 0,
          resources: dto.resources ? dto.resources.map((r) => BigInt(r)) : []
        }
      })

      const nextSortOrder = await this.getNextSortOrder(tx, chapterId)

      await tx.chapterItem.create({
        data: {
          chapter_id: chapterId,
          item_type: 'lesson',
          lesson_id: lesson.id,
          sort_order: dto.sort_order ?? nextSortOrder
        }
      })

      return lesson
    })
  }

  async findAll(params: { skip?: number; take?: number; chapterId?: bigint }) {
    const { skip, take, chapterId } = params

    const items = await this.prismaService.chapterItem.findMany({
      skip,
      take,
      where: {
        item_type: 'lesson',
        ...(chapterId ? { chapter_id: chapterId } : {})
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            course_id: true
          }
        },
        lesson: true
      }
    })

    return items
      .filter((item) => item.lesson)
      .map((item) => ({
        ...item.lesson,
        type: 'lesson',
        sort_order: item.sort_order,
        chapter: {
          id: item.chapter.id,
          title: item.chapter.title,
          course_id: item.chapter.course_id
        }
      }))
  }

  async getChapterItemByIdWithValidateUserEnrollment(itemId: string, userId: string) {
    const chapterItem = await this.prismaService.chapterItem.findUnique({
      where: { id: BigInt(itemId) },
      include: {
        lesson: true,
        lab: true,
        quiz: {
          include: {
            quiz_questions: {
              include: { quiz_options: true }
            }
          }
        },
        chapter: {
          include: {
            course: {
              select: { id: true, title: true }
            }
          }
        },
        chapterItemStatuses: {
          where: { user_id: userId, completed: true },
          select: { id: true }
        }
      }
    })

    if (!chapterItem || !chapterItem.chapter.course_id) return null

    Logger.debug(`Checking enrollment for userId=${userId} in courseId=${chapterItem.chapter.course_id}`)

    if (!(await this.isEnrolled(chapterItem.chapter.course_id.toString(), userId))) return null

    const isFinished = chapterItem.chapterItemStatuses.length > 0
    const chapter = chapterItem.chapter

    if (chapterItem.item_type === 'lesson' && chapterItem.lesson) {
      const lesson = chapterItem.lesson
      return {
        id: chapterItem.id.toString(),
        title: lesson.title,
        status: lesson.status,
        type: 'lesson' as const,
        sort_order: chapterItem.sort_order,
        short_description: lesson.short_description ?? '',
        long_description: lesson.long_description ?? '',
        duration: lesson.duration,
        chapter,
        isFinished
      }
    }

    if (chapterItem.item_type === 'lab' && chapterItem.lab) {
      const lab = chapterItem.lab
      return {
        id: chapterItem.id.toString(),
        title: lab.title,
        status: lab.status,
        type: 'lab' as const,
        sort_order: chapterItem.sort_order,
        short_description: lab.short_description ?? '',
        long_description: lab.long_description ?? '',
        duration: lab.duration,
        leaseTemplateId: lab.leaseTemplateId ?? undefined,
        chapter,
        isFinished
      }
    }

    if (chapterItem.item_type === 'quiz' && chapterItem.quiz_id) {
      const quiz = chapterItem.quiz

      if (!quiz) return null

      return {
        id: chapterItem.id.toString(),
        title: quiz.title,
        status: 'published' as const,
        type: 'quiz' as const,
        sort_order: chapterItem.sort_order,
        short_description: quiz.description ?? '',
        long_description: quiz.description ?? '',
        duration: 0,
        chapter,
        isFinished,
        questions: quiz.quiz_questions.map((q) => ({
          id: q.id.toString(),
          question_text: q.question_text,
          questionType: q.questionType,
          options: q.quiz_options.map((o) => ({
            id: o.id.toString(),
            option_text: o.option_text,
            is_correct: o.is_correct,
            description: o.description,
            reason: o.reason
          }))
        }))
      }
    }

    return null
  }

  async isEnrolled(courseId: string, userId: string) {
    Logger.debug(`Checking enrollment for userId=${userId} in courseId=${courseId}`)
    const enrollment = await this.prismaService.enrollment.findFirst({
      where: {
        user_id: userId,
        course_id: BigInt(courseId)
      },
      select: { id: true }
    })

    return !!enrollment
  }

  update(id: string, dto: UpdateLessonDto) {
    return this.prismaService.$transaction(async (tx) => {
      const data: Prisma.LessonUpdateInput = {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.short_description !== undefined ? { short_description: dto.short_description } : {}),
        ...(dto.long_description !== undefined ? { long_description: dto.long_description } : {}),
        ...(dto.thumbnail_url !== undefined ? { thumbnail_url: dto.thumbnail_url } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.duration !== undefined ? { duration: dto.duration } : {}),
        ...(dto.resources ? { resources: dto.resources.map((r) => BigInt(r)) } : {})
      }

      const lesson = await tx.lesson.update({
        where: { id: BigInt(id) },
        data
      })

      if (dto.chapter_id || dto.sort_order !== undefined) {
        await tx.chapterItem.update({
          where: { lesson_id: BigInt(id) },
          data: {
            ...(dto.chapter_id ? { chapter_id: BigInt(dto.chapter_id) } : {}),
            ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {})
          }
        })
      }

      return lesson
    })
  }

  async markLearnedChapterItem(userId: string, chapterItemId: string) {
    const chapterItem = await this.prismaService.chapterItem.findUnique({
      where: { id: BigInt(chapterItemId) },
      select: { id: true }
    })

    if (!chapterItem) {
      return null
    }

    return this.prismaService.chapterItemStatus.upsert({
      where: {
        uq_chapter_item_status_user_item: {
          user_id: userId,
          chapter_item_id: chapterItem.id
        }
      },
      create: {
        user_id: userId,
        chapter_item_id: chapterItem.id,
        completed: true,
        updated_at: new Date()
      },
      update: {
        completed: true,
        updated_at: new Date()
      }
    })
  }

  remove(id: string) {
    return this.prismaService.lesson.delete({
      where: { id: BigInt(id) }
    })
  }

  private async getNextSortOrder(tx: Prisma.TransactionClient, chapterId: bigint): Promise<number> {
    const maxOrder = await tx.chapterItem.aggregate({
      where: { chapter_id: chapterId },
      _max: { sort_order: true }
    })

    return (maxOrder._max.sort_order ?? 0) + 1
  }
}
