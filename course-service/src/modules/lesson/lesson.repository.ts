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
          resources: dto.resources ? dto.resources.map((r) => BigInt(r)) : []
        }
      })

      const nextSortOrder = await this.getNextSortOrder(tx, chapterId)

      await tx.chapterItem.create({
        data: {
          chapter_id: chapterId,
          item_type: 'lesson',
          lesson_id: lesson.id,
          sort_order: dto.sort_order ?? nextSortOrder,
          title: dto.title,
          short_description: dto.short_description,
          long_description: dto.long_description,
          status: dto.status,
          duration: dto.duration ?? 0
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
      return {
        id: chapterItem.id.toString(),
        title: chapterItem.title,
        status: chapterItem.status,
        type: 'lesson' as const,
        sort_order: chapterItem.sort_order,
        short_description: chapterItem.short_description ?? '',
        long_description: chapterItem.long_description ?? '',
        duration: chapterItem.duration,
        chapter,
        isFinished
      }
    }

    if (chapterItem.item_type === 'lab' && chapterItem.lab) {
      return {
        id: chapterItem.id.toString(),
        title: chapterItem.title,
        status: chapterItem.status,
        type: 'lab' as const,
        sort_order: chapterItem.sort_order,
        short_description: chapterItem.short_description ?? '',
        long_description: chapterItem.long_description ?? '',
        duration: chapterItem.duration,
        leaseTemplateId: chapterItem.lab.leaseTemplateId ?? undefined,
        chapter,
        isFinished
      }
    }

    if (chapterItem.item_type === 'quiz' && chapterItem.quiz_id) {
      const quiz = chapterItem.quiz

      if (!quiz) return null

      return {
        id: chapterItem.id.toString(),
        title: chapterItem.title,
        status: chapterItem.status,
        type: 'quiz' as const,
        sort_order: chapterItem.sort_order,
        short_description: chapterItem.short_description ?? '',
        long_description: chapterItem.long_description ?? '',
        duration: chapterItem.duration,
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
      const lessonData: Prisma.LessonUpdateInput = {
        ...(dto.resources ? { resources: dto.resources.map((r) => BigInt(r)) } : {})
      }

      const lesson = await tx.lesson.update({
        where: { id: BigInt(id) },
        data: lessonData
      })

      const chapterItemPatch: Prisma.ChapterItemUpdateInput = {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.short_description !== undefined ? { short_description: dto.short_description } : {}),
        ...(dto.long_description !== undefined ? { long_description: dto.long_description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.duration !== undefined ? { duration: dto.duration } : {}),
        ...(dto.chapter_id ? { chapter: { connect: { id: BigInt(dto.chapter_id) } } } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {})
      }

      if (Object.keys(chapterItemPatch).length > 0) {
        await tx.chapterItem.update({
          where: { lesson_id: BigInt(id) },
          data: chapterItemPatch
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
