import { Injectable } from '@nestjs/common'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateChapterDto } from './dto/update-chapter.dto'
import { ChapterRepository } from './chaper.repository'

@Injectable()
export class ChapterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chapterRepository: ChapterRepository
  ) {}

  create(dto: CreateChapterDto) {
    return this.prisma.chapter.create({
      data: {
        ...dto,
        course_id: dto.course_id ? BigInt(dto.course_id) : null,
        resource_id: dto.resource_id ? BigInt(dto.resource_id) : null
      }
    })
  }

  async findAll(courseId: bigint, userId: string) {
    const records = await this.chapterRepository.findAll(courseId, userId)

    let courseProgressSum = 0
    let progressChapterCount = 0

    const chapters = records.map((chapter) => {
      const totalLessons = chapter.lessons.length

      if (totalLessons === 0) {
        return {
          ...chapter,
          progress: 0
        }
      }

      let finishedCount = 0
      for (const lesson of chapter.lessons) {
        if (lesson.isFinished) finishedCount++
      }

      const chapterProgress = (finishedCount / totalLessons) * 100

      courseProgressSum += chapterProgress
      progressChapterCount++

      return {
        ...chapter,
        progress: Number(chapterProgress.toFixed(2))
      }
    })

    const courseProgress =
      progressChapterCount === 0 ? 0 : Number((courseProgressSum / progressChapterCount).toFixed(2))

    return {
      chapters,
      progress: courseProgress
    }
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
