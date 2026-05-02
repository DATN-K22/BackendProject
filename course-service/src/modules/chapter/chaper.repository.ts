import { Injectable } from '@nestjs/common'
import { ChapterResponse } from './dto/ChapterResponse'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { UpdateChapterDto } from './dto/update-chapter.dto'

@Injectable()
export class ChapterRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(dto: CreateChapterDto) {
    const { course_id, resource_id, ...rest } = dto
    return this.prismaService.chapter.create({
      data: {
        ...rest,
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
        .map((item) => ({
          ...item.lesson,
          type: 'lesson',
          sort_order: item.sort_order,
          isFinished: false
        }))
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
        .map((item) => ({
          ...item.lesson,
          type: 'lesson',
          sort_order: item.sort_order,
          isFinished: false
        }))
    }
  }

  update(id: string, dto: UpdateChapterDto) {
    return this.prismaService.chapter.update({
      where: { id: BigInt(id) },
      data: {
        ...dto,
        course_id: dto.course_id ? BigInt(dto.course_id) : undefined,
        resource_id: dto.resource_id ? BigInt(dto.resource_id) : undefined
      }
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
      short_description: '',
      status: chapter.status,
      sort_order: chapter.sort_order ?? 0,
      lessons: chapter.chapterItems
        .filter((item) => {
          // Filter ở app layer — rõ ràng, dễ debug
          if (isOwner) return true

          if (item.item_type === 'quiz') return item.quiz !== null
          if (item.item_type === 'lesson') return item.lesson?.status === 'published'
          if (item.item_type === 'lab') return item.lab?.status === 'published'

          return false
        })
        .map((item) => {
          if (item.item_type === 'lesson' && item.lesson) {
            return {
              id: item.id.toString(),
              title: item.lesson.title,
              status: item.lesson.status,
              type: 'lesson',
              sort_order: item.sort_order,
              duration: item.lesson.duration,
              isFinished: item.chapterItemStatuses.length > 0,
              short_description: item.lesson.short_description ?? '',
              long_description: item.lesson.long_description ?? '',
              resources: item.lesson.resources.map((resourceId) => resourceId.toString())
            }
          }

          if (item.item_type === 'quiz' && item.quiz) {
            return {
              id: item.id.toString(),
              title: item.quiz.title,
              status: 'published',
              type: 'quiz',
              sort_order: item.sort_order,
              duration: 0,
              isFinished: item.chapterItemStatuses.length > 0,
              short_description: item.quiz.description ?? '',
              long_description: item.quiz.description ?? '',
              resources: []
            }
          }

          if (item.item_type === 'lab' && item.lab) {
            return {
              id: item.id.toString(),
              title: item.lab.title,
              status: item.lab.status,
              type: 'lab',
              sort_order: item.sort_order,
              duration: item.lab.duration,
              isFinished: item.chapterItemStatuses.length > 0,
              short_description: item.lab.short_description ?? '',
              long_description: item.lab.long_description ?? '',
              resources: item.lab.resources.map((resourceId) => resourceId.toString())
            }
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
