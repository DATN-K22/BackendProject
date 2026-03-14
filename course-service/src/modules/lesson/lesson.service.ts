import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'
import { MediaClient } from '../media-service/MediaClient'
import { LessonRepository } from './lesson.repository'

@Injectable()
export class LessonService {
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

  async getLessonByIdWithValidateUserEnrollment(id: string, userId: string) {
    try {
      const [lesson, resourcesResponse] = await Promise.all([
        this.lessonRepository.getLessonByIdWithValidateUserEnrollment(id, userId),
        this.mediaClient.getResorcesByLessonId(id)
      ])

      if (!lesson) {
        throw new ForbiddenException('User not enrolled')
      }
      return {
        ...lesson,
        resources: resourcesResponse?.data ?? []
      }
    } catch (err) {
      Logger.error(err)
      throw new InternalServerErrorException('Fail to get lesson by id')
    }
  }

  update(id: string, dto: UpdateLessonDto) {
    return this.lessonRepository.update(id, dto)
  }

  remove(id: string) {
    return this.lessonRepository.remove(id)
  }

  async markLearnedLesson(userId: string, lessonId: string, courseId: string) {
    if (await this.lessonRepository.isEnrolled(courseId, userId))
      return this.lessonRepository.markLearnedLesson(userId, lessonId)
    else throw new ForbiddenException("User hasn't enrolled into this course")
  }
}
