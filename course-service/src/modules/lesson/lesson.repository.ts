import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ChapterItemType, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'
import { UpdateLessonOrderItemDto } from './dto/update-chapter-order.dto'

@Injectable()
export class LessonRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(dto: CreateLessonDto) {
    return this.prismaService.$transaction(async (tx) => {
      const chapterId = BigInt(dto.chapter_id)
      const nextSortOrder = await this.getNextSortOrder(tx, chapterId)
      const itemType = dto.lessonType ?? ChapterItemType.lesson

      let lessonId: bigint | null = null
      let labId: bigint | null = null
      let quizId: bigint | null = null

      if (itemType === ChapterItemType.lesson) {
        const lesson = await tx.lesson.create({
          data: {
            resources: this.mapResources(dto.resources),
            is_free: dto.is_free ?? false
          }
        })
        lessonId = lesson.id
      }

      if (itemType === ChapterItemType.lab) {
        const lab = await tx.lab.create({
          data: {
            resources: this.mapResources(dto.resources),
            leaseTemplateId: dto.leaseTemplateId,
            instruction: dto.instruction
          }
        })
        labId = lab.id
      }

      if (itemType === ChapterItemType.quiz) {
        const quiz = await tx.quiz.create({
          data: {
            quiz_questions:
              dto.questions && dto.questions.length > 0
                ? {
                    create: dto.questions.map((question) => ({
                      question_text: question.question_text,
                      questionType: question.questionType,
                      quiz_options:
                        question.options && question.options.length > 0
                          ? {
                              create: question.options.map((option) => ({
                                option_text: option.option_text,
                                is_correct: option.is_correct,
                                description: option.description ?? '',
                                reason: option.reason ?? ''
                              }))
                            }
                          : undefined
                    }))
                  }
                : undefined
          }
        })
        quizId = quiz.id
      }

      const chapterItem = await tx.chapterItem.create({
        data: {
          chapter_id: chapterId,
          item_type: itemType,
          status: dto.status,
          title: dto.title,
          short_description: dto.short_description,
          long_description: dto.long_description,
          duration: dto.duration ?? 0,
          sort_order: dto.sort_order ?? nextSortOrder,
          lesson_id: lessonId,
          lab_id: labId,
          quiz_id: quizId
        },
        include: {
          chapter: {
            select: {
              id: true,
              title: true,
              course_id: true
            }
          },
          lesson: true,
          lab: true,
          quiz: true
        }
      })

      return this.toGeneralItem(chapterItem)
    })
  }

  async updateLessonOrder(courseId: string, chapterId: string, lessons: UpdateLessonOrderItemDto[]) {
    const existingItems = await this.prismaService.chapterItem.findMany({
      where: {
        id: { in: lessons.map((l) => BigInt(l.lesson_id)) }
      },
      select: { id: true, chapter_id: true }
    })

    if (existingItems.length !== lessons.length) {
      throw new NotFoundException('One or more lessons not found')
    }

    const belongsToOtherChapter = existingItems.some((item) => item.chapter_id.toString() !== chapterId)
    if (belongsToOtherChapter) {
      throw new BadRequestException('All lessons must belong to the specified chapter')
    }

    return await this.prismaService.$transaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({
        where: { id: BigInt(chapterId), course_id: BigInt(courseId) }
      })
      if (!chapter) throw new NotFoundException('Chapter not found for the given course')

      const TEMP_OFFSET = 1_000_000
      for (const l of lessons) {
        await tx.chapterItem.update({
          where: { id: BigInt(l.lesson_id) },
          data: { sort_order: l.sort_order + TEMP_OFFSET }
        })
      }

      for (const l of lessons) {
        await tx.chapterItem.update({
          where: { id: BigInt(l.lesson_id) },
          data: { sort_order: l.sort_order }
        })
      }
    })
  }

  async findAll(params: { skip?: number; take?: number; chapterId?: bigint }) {
    const { skip, take, chapterId } = params

    const items = await this.prismaService.chapterItem.findMany({
      skip,
      take,
      where: {
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
        lesson: true,
        lab: true,
        quiz: true
      }
    })

    return items.map((item) => this.toGeneralItem(item))
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
              select: { id: true, title: true, owner_id: true }
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

    if (
      !(chapterItem.chapter.course?.owner_id === userId) &&
      !(await this.isEnrolled(chapterItem.chapter.course_id.toString(), userId))
    )
      return null

    const isFinished = chapterItem.chapterItemStatuses.length > 0
    const chapter = chapterItem.chapter

    if (chapterItem.item_type === 'lesson' && chapterItem.lesson) {
      const lesson = chapterItem.lesson
      return {
        id: chapterItem.id.toString(),
        title: chapterItem.title,
        status: chapterItem.status,
        type: 'lesson' as const,
        sort_order: chapterItem.sort_order,
        short_description: chapterItem.short_description ?? '',
        long_description: chapterItem.long_description ?? '',
        duration: chapterItem.duration,
        is_free: lesson.is_free,
        resources: (lesson.resources ?? []).map((resourceId) => resourceId.toString()),
        chapter,
        isFinished
      }
    }

    if (chapterItem.item_type === 'lab' && chapterItem.lab) {
      const lab = chapterItem.lab
      return {
        id: chapterItem.id.toString(),
        title: chapterItem.title,
        status: chapterItem.status,
        type: 'lab' as const,
        sort_order: chapterItem.sort_order,
        short_description: chapterItem.short_description ?? '',
        long_description: chapterItem.long_description ?? '',
        duration: chapterItem.duration,
        leaseTemplateId: lab.leaseTemplateId ?? undefined,
        instruction: lab.instruction ?? undefined,
        resources: (lab.resources ?? []).map((resourceId) => resourceId.toString()),
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
    const course = await this.prismaService.course.findUnique({
      where: { id: BigInt(courseId) },
      select: { owner_id: true }
    })
    if (course?.owner_id === userId) return true

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
      const chapterItemId = BigInt(id)
      const chapterItem = await tx.chapterItem.findUnique({
        where: { id: chapterItemId },
        select: {
          id: true,
          item_type: true,
          lesson_id: true,
          lab_id: true,
          quiz_id: true
        }
      })

      if (!chapterItem) {
        throw new NotFoundException('Chapter item not found')
      }

      if (dto.lessonType && dto.lessonType !== chapterItem.item_type) {
        throw new BadRequestException('Cannot change chapter item type')
      }

      const chapterItemData: Prisma.ChapterItemUncheckedUpdateInput = {
        ...(dto.chapter_id ? { chapter_id: BigInt(dto.chapter_id) } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.short_description !== undefined ? { short_description: dto.short_description } : {}),
        ...(dto.long_description !== undefined ? { long_description: dto.long_description } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.duration !== undefined ? { duration: dto.duration } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {})
      }

      if (Object.keys(chapterItemData).length > 0) {
        await tx.chapterItem.update({
          where: { id: chapterItemId },
          data: chapterItemData
        })
      }

      if (chapterItem.item_type === ChapterItemType.lesson && chapterItem.lesson_id) {
        const lessonData: Prisma.LessonUncheckedUpdateInput = {
          ...(dto.resources !== undefined ? { resources: this.mapResources(dto.resources) } : {}),
          ...(dto.is_free !== undefined ? { is_free: dto.is_free } : {})
        }

        if (Object.keys(lessonData).length > 0) {
          await tx.lesson.update({
            where: { id: chapterItem.lesson_id },
            data: lessonData
          })
        }
      }

      if (chapterItem.item_type === ChapterItemType.lab && chapterItem.lab_id) {
        const labData: Prisma.LabUncheckedUpdateInput = {
          ...(dto.resources !== undefined ? { resources: this.mapResources(dto.resources) } : {}),
          ...(dto.leaseTemplateId !== undefined ? { leaseTemplateId: dto.leaseTemplateId } : {}),
          ...(dto.instruction !== undefined ? { instruction: dto.instruction } : {})
        }

        if (Object.keys(labData).length > 0) {
          await tx.lab.update({
            where: { id: chapterItem.lab_id },
            data: labData
          })
        }
      }

      if (chapterItem.item_type === ChapterItemType.quiz && chapterItem.quiz_id && dto.questions !== undefined) {
        await tx.quiz.update({
          where: { id: chapterItem.quiz_id },
          data: {
            quiz_questions: {
              deleteMany: {},
              create: dto.questions.map((question) => ({
                question_text: question.question_text,
                questionType: question.questionType,
                quiz_options:
                  question.options && question.options.length > 0
                    ? {
                        create: question.options.map((option) => ({
                          option_text: option.option_text,
                          is_correct: option.is_correct,
                          description: option.description ?? '',
                          reason: option.reason ?? ''
                        }))
                      }
                    : undefined
              }))
            }
          }
        })
      }

      const updatedItem = await tx.chapterItem.findUnique({
        where: { id: chapterItemId },
        include: {
          chapter: {
            select: {
              id: true,
              title: true,
              course_id: true
            }
          },
          lesson: true,
          lab: true,
          quiz: true
        }
      })

      if (!updatedItem) {
        throw new NotFoundException('Chapter item not found')
      }

      return this.toGeneralItem(updatedItem)
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
    return this.prismaService.$transaction(async (tx) => {
      const chapterItemId = BigInt(id)
      const chapterItem = await tx.chapterItem.findUnique({
        where: { id: chapterItemId },
        select: {
          id: true,
          item_type: true,
          lesson_id: true,
          lab_id: true,
          quiz_id: true
        }
      })

      if (!chapterItem) {
        throw new NotFoundException('Chapter item not found')
      }

      if (chapterItem.item_type === ChapterItemType.lesson && chapterItem.lesson_id) {
        await tx.lesson.delete({ where: { id: chapterItem.lesson_id } })
      } else if (chapterItem.item_type === ChapterItemType.lab && chapterItem.lab_id) {
        await tx.lab.delete({ where: { id: chapterItem.lab_id } })
      } else if (chapterItem.item_type === ChapterItemType.quiz && chapterItem.quiz_id) {
        await tx.quiz.delete({ where: { id: chapterItem.quiz_id } })
      } else {
        await tx.chapterItem.delete({ where: { id: chapterItemId } })
      }

      return { id: chapterItemId.toString() }
    })
  }

  private toGeneralItem(item: {
    id: bigint
    item_type: ChapterItemType
    title: string
    short_description: string | null
    long_description: string | null
    status: any
    sort_order: number
    duration: number
    chapter: { id: bigint; title: string; course_id: bigint | null }
    lesson: { resources: bigint[]; is_free: boolean } | null
    lab: { resources: bigint[]; leaseTemplateId: string | null; instruction: string | null } | null
    quiz: { id: bigint } | null
  }) {
    return {
      id: item.id.toString(),
      title: item.title,
      short_description: item.short_description ?? '',
      long_description: item.long_description ?? '',
      status: item.status,
      type: item.item_type,
      sort_order: item.sort_order,
      duration: item.duration,
      chapter: {
        id: item.chapter.id,
        title: item.chapter.title,
        course_id: item.chapter.course_id
      },
      resources:
        item.item_type === ChapterItemType.lesson && item.lesson
          ? (item.lesson.resources ?? []).map((resourceId) => resourceId.toString())
          : item.item_type === ChapterItemType.lab && item.lab
            ? (item.lab.resources ?? []).map((resourceId) => resourceId.toString())
            : [],
      is_free: item.item_type === ChapterItemType.lesson ? (item.lesson?.is_free ?? false) : undefined,
      leaseTemplateId: item.item_type === ChapterItemType.lab ? (item.lab?.leaseTemplateId ?? undefined) : undefined,
      instruction: item.item_type === ChapterItemType.lab ? (item.lab?.instruction ?? undefined) : undefined,
      quiz_id: item.item_type === ChapterItemType.quiz ? item.quiz?.id.toString() : undefined
    }
  }

  private mapResources(resources?: string[]): bigint[] {
    return resources ? resources.map((resourceId) => BigInt(resourceId)) : []
  }

  private async getNextSortOrder(tx: Prisma.TransactionClient, chapterId: bigint): Promise<number> {
    const maxOrder = await tx.chapterItem.aggregate({
      where: { chapter_id: chapterId },
      _max: { sort_order: true }
    })

    return (maxOrder._max.sort_order ?? 0) + 1
  }
}
