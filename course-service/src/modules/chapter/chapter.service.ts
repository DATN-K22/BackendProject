import { Injectable } from '@nestjs/common'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { UpdateChapterDto } from './dto/update-chapter.dto'
import { ChapterRepository } from './chaper.repository'
import { LessonService } from '../lesson/lesson.service'
import { title } from 'process'

@Injectable()
export class ChapterService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly lessonService: LessonService
  ) {}

  create(dto: CreateChapterDto) {
    return this.chapterRepository.create(dto)
  }

  findAll(params: { skip?: number; take?: number; courseId?: bigint }) {
    return this.chapterRepository.findAll(params)
  }

  findOne(id: string) {
    return this.chapterRepository.findOne(id)
  }

  update(id: string, dto: UpdateChapterDto) {
    return this.chapterRepository.update(id, dto)
  }

  remove(id: string) {
    return this.chapterRepository.remove(id)
  }

  async findAllChapterForTOC(courseId: string, userId: string) {
    const records = await this.chapterRepository.findAllForTOC(BigInt(courseId), userId)

    let totalLessonsInCourse = 0
    let totalFinishedLessons = 0

    const chapters = records.chapters.map((chapter) => {
      const totalLessons = chapter.lessons.length

      const finishedCount = chapter.lessons.filter((l) => l.isFinished).length

      totalLessonsInCourse += totalLessons
      totalFinishedLessons += finishedCount

      const chapterProgress = totalLessons === 0 ? 0 : Number(((finishedCount / totalLessons) * 100).toFixed(2))

      return {
        ...chapter,
        progress: chapterProgress
      }
    })

    const courseProgress =
      totalLessonsInCourse === 0 ? 0 : Number(((totalFinishedLessons / totalLessonsInCourse) * 100).toFixed(2))

    return {
      course: {
        id: records.course.id,
        title: records.course.title
      },
      chapters,
      progress: courseProgress
    }
  }
}
