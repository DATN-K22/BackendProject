import { ForbiddenException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'
import { MediaClient } from '../media-service/MediaClient'
import { LessonRepository } from './lesson.repository'

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name)

  constructor(
    private readonly lessonRepository: LessonRepository,

    @Inject('MediaClient')
    private readonly mediaClient: MediaClient
  ) {}

  create(dto: CreateLessonDto) {
    return this.lessonRepository.create(dto)
  }

  findAll(params: { skip?: number; take?: number; chapterId?: bigint }) {
    return this.lessonRepository.findAll(params)
  }

  async getChapterItemByIdWithValidateUserEnrollment(id: string, userId: string) {
    try {
      const item = await this.lessonRepository.getChapterItemByIdWithValidateUserEnrollment(id, userId)

      if (!item) {
        throw new ForbiddenException('User not enrolled or item not found')
      }

      if (item.type === 'quiz') {
        return item
      }

      const resourcesResponse = await this.mediaClient.getResourcesByChapterItemId(id)
      return {
        ...item,
        resources: resourcesResponse?.data ?? []
      }
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw err
      }
      this.logger.error(err)
      throw new InternalServerErrorException('Fail to get chapter item by id')
    }
  }

  update(id: string, dto: UpdateLessonDto) {
    return this.lessonRepository.update(id, dto)
  }

  remove(id: string) {
    return this.lessonRepository.remove(id)
  }

  async markLearnedChapterItem(userId: string, chapterItemId: string, courseId: string) {
    if (!(await this.lessonRepository.isEnrolled(courseId, userId))) {
      throw new ForbiddenException("User hasn't enrolled into this course")
    }

    const result = await this.lessonRepository.markLearnedChapterItem(userId, chapterItemId)
    if (!result) {
      throw new ForbiddenException('Chapter item not found')
    }

    return result
  }
}
