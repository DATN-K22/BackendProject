import { Inject, Injectable, Logger } from '@nestjs/common'
import { CourseRepositoy } from './course.repository'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { IamClient } from '../iam-service/IamClient'
import { IncompleteCourse } from './dto/response/IncompleteCourseResponse'
import { AppException } from '../../utils/excreption/AppException'
import { ErrorCode } from '../../utils/excreption/ErrorCode'
import { ChapterService } from '../chapter/chapter.service'

@Injectable()
export class CourseService {
  constructor(
    private readonly courseRepository: CourseRepositoy,
    private readonly chapterService: ChapterService,

    @Inject('IamClient')
    private readonly iamClient: IamClient
  ) {}

  async create(createCourseDto: CreateCourseDto) {
    return this.courseRepository.create(createCourseDto)
  }

  // async findAll(offset: number, limit: number) {
  //   return this.courseRepository.findAll(offset, limit);
  // }

  // async getTopRatingCourse(offset: number, limit: number) {
  //   return this.courseRepository.getTopRatingCourse(offset, limit)
  // }

  async getLatestIncompleteCourseForUser(userId: string, offset: number, limit: number): Promise<IncompleteCourse[]> {
    // get latest incomplete course list for user
    const incompleteCourse = await this.courseRepository.getLatestIncompleteCourseForUser(userId, offset, limit)
    // get creator of each course and return with creator info
    const creatorInfoMap = await this.getCreatorIds(incompleteCourse)
    return incompleteCourse.map((course) => {
      return {
        id: course.id,
        thumbnail_url: course.thumbnail_url,
        title: course.title,
        progress: course.progress,
        user: creatorInfoMap.get(course.owner_id)
      }
    })
  }

  async getRecommendationCourses(offset: number, limit: number) {
    const courses = await this.courseRepository.getRecommendationCourses(offset, limit)
    const creatorInfoMap = await this.getCreatorIds(courses)
    return courses.map((course) => {
      return {
        ...course,
        user: creatorInfoMap.get(course.owner_id)
      }
    })
  }

  async findOne(id: string, userId: string, include: string) {
    const course = await this.courseRepository.findOne(id, userId)
    if (!course) return null

    const chapterPromise = include ? this.chapterService.findAllChapterForTOC(id, userId) : Promise.resolve(null)

    const creatorPromise = this.getCreatorIds([course])

    const [chapters, creatorInfoMap] = await Promise.all([chapterPromise, creatorPromise])

    return {
      ...course,
      isEnrolled: course.isEnrolled || course.owner_id === userId,
      user: {
        id: course.owner_id,
        ...creatorInfoMap.get(course.owner_id)
      },
      chapters
    }
  }

  update(id: number, updateCourseDto: UpdateCourseDto) {
    return this.courseRepository.update(updateCourseDto, id)
  }

  remove(id: number) {
    return `This action removes a #${id} course`
  }

  private async getCreatorIds(courses: any[]): Promise<Map<string, { id: string; name: string; avt_url: string }>> {
    const creatorIds = courses.map((course) => course.owner_id)
    try {
      const creatorInfo = await this.iamClient.findUserById(creatorIds)
      const creatorInfoMap: Map<string, { id: string; name: string; avt_url: string }> = new Map(
        creatorInfo.map((creator) => [creator.id, creator])
      )
      return creatorInfoMap
    } catch (error) {
      console.error('Error fetching creator info from IAM service:', error)
      throw new Error('Failed to fetch creator info')
    }
  }

  async getEnrolledCourses(userId: string, offset: number, limit: number) {
    const { data: courses, totalItems } = await this.courseRepository.getEnrolledCourses(userId, offset, limit)

    const creatorInfoMap = await this.getCreatorIds(courses)

    const totalPages = Math.ceil(totalItems / limit)
    const currentPage = Math.floor(offset / limit) + 1

    const data = courses.map((course) => ({
      ...course,
      user: creatorInfoMap.get(course.owner_id)
    }))

    return {
      data,
      meta: {
        totalItems,
        totalPages,
        itemsPerPage: limit,
        currentPage
      }
    }
  }
}
