import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ChapterResponse } from './dto/ChapterResponse'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { UpdateChapterDto } from './dto/update-chapter.dto'
import { UpdateChapterOrderItemDto } from './dto/update-chapter-order.dto'

@Injectable()
export class ChapterRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private async getNextSortOrder(courseId?: bigint) {
    const aggregate = await this.prismaService.chapter.aggregate({
      where: courseId ? { course_id: courseId } : undefined,
      _max: { sort_order: true }
    })

    return (aggregate._max.sort_order ?? 0) + 1
  }

  private mapChapterItem(item: {
    id: bigint
    item_type: string
    title?: string | null
    short_description?: string | null
    long_description?: string | null
    status: string
    sort_order: number
    duration?: number | null
    lesson?: { id: bigint; resources?: bigint[] | null; is_free?: boolean } | null
    quiz?: { id: bigint } | null
    lab?: {
      id: bigint
      resources?: bigint[] | null
      leaseTemplateId?: string | null
      instruction?: string | null
    } | null
    chapterItemStatuses?: { id: bigint }[]
  }) {
    const lesson = item.lesson as unknown as {
      title?: string
      short_description?: string | null
      long_description?: string | null
      resources?: bigint[] | null
      is_free?: boolean
    } | null
    const quiz = item.quiz as unknown as {
      title?: string
      description?: string | null
    } | null
    const lab = item.lab as unknown as {
      title?: string
      short_description?: string | null
      long_description?: string | null
      resources?: bigint[] | null
      leaseTemplateId?: string | null
      instruction?: string | null
    } | null
    const fallbackId = (item as any).id ?? (lesson as any)?.id ?? (quiz as any)?.id ?? (lab as any)?.id ?? 0n

    const base = {
      id: fallbackId.toString(),
      title: item.title ?? lesson?.title ?? quiz?.title ?? lab?.title ?? '',
      status: item.status,
      type: item.item_type,
      sort_order: item.sort_order,
      duration: item.duration ?? 0,
      short_description:
        item.short_description ?? lesson?.short_description ?? quiz?.description ?? lab?.short_description ?? '',
      long_description:
        item.long_description ?? lesson?.long_description ?? quiz?.description ?? lab?.long_description ?? '',
      isFinished: (item.chapterItemStatuses ?? []).length > 0
    }

    if (item.item_type === 'lesson') {
      return {
        ...base,
        resources: (lesson?.resources ?? []).map((resourceId) => resourceId.toString())
      }
    }

    if (item.item_type === 'lab') {
      return {
        ...base,
        resources: (lab?.resources ?? []).map((resourceId) => resourceId.toString()),
        leaseTemplateId: lab?.leaseTemplateId ?? undefined,
        instruction: lab?.instruction ?? undefined
      }
    }

    if (item.item_type === 'quiz') {
      return {
        ...base,
        resources: []
      }
    }

    return {
      ...base,
      resources: []
    }
  }

  async create(dto: CreateChapterDto) {
    const {
      course_id,
      resource_id,
      sort_order: _sortOrder,
      ...rest
    } = dto as CreateChapterDto & {
      sort_order?: number
    }
    const nextSortOrder = await this.getNextSortOrder(course_id ? BigInt(course_id) : undefined)

    return this.prismaService.chapter.create({
      data: {
        ...rest,
        sort_order: nextSortOrder,
        course: course_id ? { connect: { id: BigInt(course_id) } } : undefined,
        resource_id: resource_id ? BigInt(resource_id) : null
      }
    })
  }

  async findAll(params: { skip?: number; take?: number; courseId?: bigint }) {
    const { skip, take, courseId } = params
    const chapters = await this.prismaService.chapter.findMany({
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
        chapterItems: {
          where: {
            item_type: 'lesson',
            lesson_id: { not: null }
          },
          orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
          include: {
            lesson: true
          }
        }
      }
    })

    return chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.chapterItems
        .filter((item) => item.lesson)
        .map((item) => {
          const lesson = item.lesson as any

          return {
            ...lesson,
            id: lesson.id,
            title: item.title ?? lesson.title ?? '',
            status: item.status,
            type: 'lesson',
            sort_order: item.sort_order,
            isFinished: false
          }
        })
    }))
  }

  async findOne(id: string) {
    const chapter = await this.prismaService.chapter.findUnique({
      where: { id: BigInt(id) },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        chapterItems: {
          where: {
            item_type: 'lesson',
            lesson_id: { not: null }
          },
          orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
          include: {
            lesson: true
          }
        }
      }
    })

    if (!chapter) return null

    return {
      ...chapter,
      lessons: chapter.chapterItems
        .filter((item) => item.lesson)
        .map((item) => {
          const lesson = item.lesson as any

          return {
            ...lesson,
            id: lesson.id,
            title: item.title ?? lesson.title ?? '',
            status: item.status,
            type: 'lesson',
            sort_order: item.sort_order,
            isFinished: false
          }
        })
    }
  }

  update(id: string, dto: UpdateChapterDto) {
    return this.prismaService.chapter.update({
      where: { id: BigInt(id) },
      data: {
        title: dto.title,
        status: dto.status,
        course_id: dto.course_id ? BigInt(dto.course_id) : undefined,
        resource_id: dto.resource_id ? BigInt(dto.resource_id) : undefined
      }
    })
  }

  async updateOrder(courseId: string, chapters: UpdateChapterOrderItemDto[]) {
    return this.prismaService.$transaction(async (tx) => {
      const existing = await tx.chapter.findMany({
        where: {
          course_id: BigInt(courseId),
          id: { in: chapters.map((c) => BigInt(c.chapter_id)) }
        },
        select: { id: true }
      })

      if (existing.length !== chapters.length) {
        throw new NotFoundException('Một hoặc nhiều chapter không tồn tại trong course này')
      }

      await Promise.all(
        chapters.map((c) =>
          tx.chapter.update({
            where: { id: BigInt(c.chapter_id) },
            data: { sort_order: c.sort_order }
          })
        )
      )

      return { message: 'Cập nhật thứ tự thành công' }
    })
  }

  remove(id: string) {
    return this.prismaService.chapter.delete({
      where: { id: BigInt(id) }
    })
  }

  async findAllForTOC(courseId: bigint, userId: string): Promise<{ course: any; chapters: ChapterResponse[] }> {
    const course = await this.prismaService.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        owner_id: true
      }
    })

    if (!course) {
      return { course: null, chapters: [] }
    }

    const isOwner = course.owner_id === userId

    const chapters = await this.prismaService.chapter.findMany({
      where: {
        course_id: courseId,
        ...(isOwner ? {} : { status: 'published' })
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      include: {
        chapterItems: {
          orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
          include: {
            lesson: true,
            quiz: true,
            lab: true,
            chapterItemStatuses: {
              where: {
                user_id: userId,
                completed: true
              },
              select: {
                id: true
              }
            }
          }
        }
      }
    })

    const chapterResponses: ChapterResponse[] = chapters.map((chapter) => ({
      id: chapter.id.toString(),
      title: chapter.title,
      status: chapter.status,
      sort_order: chapter.sort_order ?? 0,
      lessons: chapter.chapterItems
        .filter((item) => {
          // Filter ở app layer — rõ ràng, dễ debug
          if (isOwner) return true

          if (item.status !== 'published') return false
          if (item.item_type === 'quiz') return item.quiz !== null
          if (item.item_type === 'lesson') return item.lesson !== null
          if (item.item_type === 'lab') return item.lab !== null

          return false
        })
        .map((item) => {
          if (item.item_type === 'lesson' && item.lesson) {
            return this.mapChapterItem(item)
          }

          if (item.item_type === 'quiz' && item.quiz) {
            return this.mapChapterItem(item)
          }

          if (item.item_type === 'lab' && item.lab) {
            return this.mapChapterItem(item)
          }

          return null
        })
        .filter(Boolean) as ChapterResponse['lessons']
    }))

    return {
      course: {
        id: course.id.toString(),
        title: course.title
      },
      chapters: chapterResponses
    }
  }
}
