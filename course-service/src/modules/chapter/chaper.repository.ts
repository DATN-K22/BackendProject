import { Injectable } from '@nestjs/common'
import { ChapterResponse } from './dto/ChapterResponse'
import { PrismaService } from '../prisma/prisma.service'
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

  findAll(params: { skip?: number; take?: number; courseId?: bigint }) {
    const { skip, take, courseId } = params
    return this.prismaService.chapter.findMany({
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
    return this.prismaService.chapter.findUnique({
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
    const rows = await this.prismaService.$queryRawUnsafe<any[]>(
      `
    SELECT
      ch.id                AS chapter_id,
      ch.title             AS chapter_title,
      ch.short_description AS chapter_short_description,
      ch.status            AS chapter_status,
      ch.sort_order        AS chapter_sort_order,

      l.id                 AS lesson_id,
      l.title              AS lesson_title,
      l.status             AS lesson_status,
      l.type               AS lesson_type,
      l.sort_order         AS lesson_sort_order,


      c.id                 AS course_id,
      c.title              AS course_title,

      CASE 
        WHEN ls.id IS NOT NULL THEN true 
        ELSE false 
      END AS is_finished

    FROM "Chapter" ch
    JOIN "Course" c 
      ON c.id = ch.course_id

    JOIN "Lesson" l 
      ON l.chapter_id = ch.id

    LEFT JOIN "LessonStatus" ls
      ON ls.lesson_id = l.id
     AND ls.user_id = $1

    WHERE ch.course_id = $2
      AND (
        c.owner_id = $1
        OR (
          ch.status = 'published'
          AND l.status = 'published'
        )
      )

    ORDER BY 
      ch.sort_order ASC,
      l.sort_order ASC
    `,
      userId,
      courseId
    )

    if (!rows.length) {
      return { course: null, chapters: [] }
    }

    const course = {
      id: rows[0].course_id.toString(),
      title: rows[0].course_title
    }

    const chapterMap = new Map<string, ChapterResponse>()

    for (const row of rows) {
      const chapterId = row.chapter_id.toString()

      if (!chapterMap.has(chapterId)) {
        chapterMap.set(chapterId, {
          id: chapterId,
          title: row.chapter_title,
          short_description: row.chapter_short_description,
          status: row.chapter_status,
          sort_order: row.chapter_sort_order,
          lessons: []
        })
      }

      const chapter = chapterMap.get(chapterId)!

      chapter.lessons.push({
        id: row.lesson_id.toString(),
        title: row.lesson_title,
        status: row.lesson_status,
        type: row.lesson_type,
        sort_order: row.lesson_sort_order,
        duration: row.lesson_duration,
        isFinished: row.is_finished
      })
    }

    return {
      course,
      chapters: Array.from(chapterMap.values())
    }
  }
}
