import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CourseService } from '../../modules/course/course.service'
import { CourseRepositoy } from '../../modules/course/course.repository'
import { ChapterService } from '../../modules/chapter/chapter.service'
import { IamClient } from '../../modules/iam-service/IamClient'
import { ContentStatus } from '@prisma/client'

const mockCourseRepository = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  getLatestIncompleteCourseForUser: jest.fn(),
  getRecommendationCourses: jest.fn(),
  getEnrolledCourses: jest.fn(),
  findCourseById: jest.fn(),
  findEnrollment: jest.fn(),
  createEnrollment: jest.fn()
}

const mockChapterService = {
  findAllChapterForTOC: jest.fn()
}

const mockIamClient = {
  findUserById: jest.fn()
}

describe('CourseService', () => {
  let service: CourseService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: CourseRepositoy, useValue: mockCourseRepository },
        { provide: ChapterService, useValue: mockChapterService },
        { provide: 'IamClient', useValue: mockIamClient }
      ]
    }).compile()

    service = module.get<CourseService>(CourseService)
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should delegate to repository and return created course', async () => {
      const createDto = {
        owner_id: 'user-1',
        title: 'AWS Course',
        short_description: 'Learn AWS',
        long_description: 'Details',
        thumbnail_url: 'thumb.jpg',
        price: 100000,
        status: ContentStatus.draft
      }
      const created = { id: '1', ...createDto, created_at: new Date() }

      mockCourseRepository.create.mockResolvedValue(created)

      const result = await service.create(createDto)

      expect(mockCourseRepository.create).toHaveBeenCalledWith(createDto)
      expect(result).toEqual(created)
    })
  })

  describe('findAll', () => {
    it('should return paginated courses with meta information', async () => {
      const courses = [
        { id: '1', title: 'Course 1' },
        { id: '2', title: 'Course 2' }
      ]

      mockCourseRepository.findAll.mockResolvedValue({
        data: courses,
        totalItems: 2
      })

      const result = await service.findAll(1, 10)

      expect(mockCourseRepository.findAll).toHaveBeenCalledWith(1, 10, undefined)
      expect(result).toMatchObject({
        data: courses,
        meta: {
          totalItems: 2,
          totalPages: 1,
          itemsPerPage: 10,
          currentPage: 1
        }
      })
    })

    it('should filter by owner_id when provided', async () => {
      const courses = [{ id: '1', title: 'Course 1', owner_id: 'user-1' }]

      mockCourseRepository.findAll.mockResolvedValue({
        data: courses,
        totalItems: 1
      })

      const result = await service.findAll(1, 10, 'user-1')

      expect(mockCourseRepository.findAll).toHaveBeenCalledWith(1, 10, 'user-1')
      expect(result.data).toHaveLength(1)
    })

    it('should calculate total pages correctly', async () => {
      mockCourseRepository.findAll.mockResolvedValue({
        data: [],
        totalItems: 25
      })

      const result = await service.findAll(1, 10)

      expect(result.meta.totalPages).toBe(3)
    })
  })

  describe('findOne', () => {
    it('should return course detail with chapters when include is set', async () => {
      const course = {
        id: '1',
        title: 'Course 1',
        owner_id: 'owner-1',
        isEnrolled: false
      }

      mockCourseRepository.findOne.mockResolvedValue(course)
      mockChapterService.findAllChapterForTOC.mockResolvedValue([{ id: 'ch1', title: 'Chapter 1' }])
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }])

      const result = await service.findOne('1', 'user-1', 'toc')

      expect(mockCourseRepository.findOne).toHaveBeenCalledWith('1', 'user-1')
      expect(mockChapterService.findAllChapterForTOC).toHaveBeenCalledWith('1', 'user-1')
      expect(result).toMatchObject({
        id: '1',
        title: 'Course 1',
        chapters: [{ id: 'ch1', title: 'Chapter 1' }],
        user: { id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }
      })
    })

    it('should not load chapters when include is empty', async () => {
      const course = {
        id: '1',
        title: 'Course 1',
        owner_id: 'owner-1',
        isEnrolled: false
      }

      mockCourseRepository.findOne.mockResolvedValue(course)
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }])

      const result = await service.findOne('1', 'user-1', '')

      expect(mockChapterService.findAllChapterForTOC).not.toHaveBeenCalled()
      expect(result?.chapters).toBeNull()
    })

    it('should set isEnrolled to true when user is the owner', async () => {
      const course = {
        id: '1',
        owner_id: 'owner-1',
        isEnrolled: false
      }

      mockCourseRepository.findOne.mockResolvedValue(course)
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }])

      const result = await service.findOne('1', 'owner-1', '')

      expect(result?.isEnrolled).toBe(true)
    })

    it('should return null when course not found', async () => {
      mockCourseRepository.findOne.mockResolvedValue(null)

      const result = await service.findOne('999', 'user-1', '')

      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    it('should update course and return updated data', async () => {
      const updateDto = { title: 'Updated Course' }
      const updated = { id: '1', ...updateDto }

      mockCourseRepository.update.mockResolvedValue(updated)

      const result = await service.update(1, updateDto)

      expect(mockCourseRepository.update).toHaveBeenCalledWith(updateDto, 1)
      expect(result).toEqual(updated)
    })
  })

  describe('remove', () => {
    it('should delete course', async () => {
      mockCourseRepository.delete.mockResolvedValue(undefined)

      const result = await service.remove(1)

      expect(mockCourseRepository.delete).toHaveBeenCalledWith(1)
    })
  })

  describe('getLatestIncompleteCourseForUser', () => {
    it('should return incomplete courses with creator info', async () => {
      const incompleteCourses = [
        { id: '1', owner_id: 'owner-1', title: 'Course 1', progress: 30, thumbnail_url: 'thumb.jpg' }
      ]

      mockCourseRepository.getLatestIncompleteCourseForUser.mockResolvedValue(incompleteCourses)
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner 1', avt_url: 'avatar.jpg' }])

      const result = await service.getLatestIncompleteCourseForUser('user-1', 0, 10)

      expect(mockCourseRepository.getLatestIncompleteCourseForUser).toHaveBeenCalledWith('user-1', 0, 10)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: '1',
        title: 'Course 1',
        thumbnail_url: 'thumb.jpg',
        progress: 30,
        user: {
          id: 'owner-1',
          name: 'Owner 1',
          avt_url: 'avatar.jpg'
        }
      })
    })

    it('should handle missing creator info gracefully', async () => {
      const incompleteCourses = [
        { id: '1', owner_id: 'unknown-owner', title: 'Course 1', progress: 30, thumbnail_url: 'thumb.jpg' }
      ]

      mockCourseRepository.getLatestIncompleteCourseForUser.mockResolvedValue(incompleteCourses)
      mockIamClient.findUserById.mockResolvedValue([])

      const result = await service.getLatestIncompleteCourseForUser('user-1', 0, 10)

      expect(result[0].user).toMatchObject({
        id: 'unknown-owner',
        name: '',
        avt_url: ''
      })
    })
  })

  describe('getRecommendationCourses', () => {
    it('should return recommended courses with creator info', async () => {
      const courses = [{ id: '1', owner_id: 'owner-1', title: 'Top Course', rating: 5 }]

      mockCourseRepository.getRecommendationCourses.mockResolvedValue(courses)
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }])

      const result = await service.getRecommendationCourses(0, 10)

      expect(mockCourseRepository.getRecommendationCourses).toHaveBeenCalledWith(0, 10)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: '1',
        owner_id: 'owner-1',
        title: 'Top Course',
        rating: 5,
        user: { id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }
      })
    })
  })

  describe('getEnrolledCourses', () => {
    it('should return enrolled courses with pagination and creator info', async () => {
      const courses = [{ id: '1', owner_id: 'owner-1', title: 'Enrolled Course' }]

      mockCourseRepository.getEnrolledCourses.mockResolvedValue({
        data: courses,
        totalItems: 1
      })
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }])

      const result = await service.getEnrolledCourses('user-1', 1, 10)

      expect(mockCourseRepository.getEnrolledCourses).toHaveBeenCalledWith('user-1', 1, 10)
      expect(result).toMatchObject({
        data: expect.any(Array),
        meta: {
          totalItems: 1,
          totalPages: 1,
          itemsPerPage: 10,
          currentPage: 1
        }
      })
    })

    it('should calculate pagination correctly for multiple pages', async () => {
      const courses = [{ id: '1', owner_id: 'owner-1', title: 'Course 1' }]

      mockCourseRepository.getEnrolledCourses.mockResolvedValue({
        data: courses,
        totalItems: 11
      })
      mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' }])

      const result = await service.getEnrolledCourses('user-1', 10, 10)

      expect(result.meta).toMatchObject({
        totalItems: 11,
        totalPages: 2,
        itemsPerPage: 10,
        currentPage: 10
      })
    })
  })

  describe('enrollUserInCourse', () => {
    it('should enroll user in course when all conditions are met', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        status: 'published'
      })
      mockCourseRepository.findEnrollment.mockResolvedValue(null)
      mockCourseRepository.createEnrollment.mockResolvedValue({ id: 1n })

      await service.enrollUserInCourse('user-1', '1')

      expect(mockCourseRepository.findCourseById).toHaveBeenCalledWith(1n)
      expect(mockCourseRepository.findEnrollment).toHaveBeenCalledWith('user-1', 1n)
      expect(mockCourseRepository.createEnrollment).toHaveBeenCalledWith('user-1', 1n)
    })

    it('should throw NotFoundException when course not found', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue(null)

      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(NotFoundException)
      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow('Course 1 not found')
    })

    it('should throw BadRequestException when course is unpublished', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        status: 'draft'
      })

      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(BadRequestException)
      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow('Cannot enroll in an unpublished course')
    })

    it('should throw BadRequestException when course owner tries to enroll', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue({
        id: 1n,
        owner_id: 'user-1',
        status: 'published'
      })

      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(BadRequestException)
      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(
        'Course owner cannot enroll in their own course'
      )
    })

    it('should throw ConflictException when user is already enrolled', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        status: 'published'
      })
      mockCourseRepository.findEnrollment.mockResolvedValue({ id: 1n })

      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(ConflictException)
      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow('User is already enrolled in this course')
    })

    it('should not call findEnrollment when course is unpublished', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        status: 'draft'
      })

      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(BadRequestException)
      expect(mockCourseRepository.findEnrollment).not.toHaveBeenCalled()
    })

    it('should not call findEnrollment when user is the owner', async () => {
      mockCourseRepository.findCourseById.mockResolvedValue({
        id: 1n,
        owner_id: 'user-1',
        status: 'published'
      })

      await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(BadRequestException)
      expect(mockCourseRepository.findEnrollment).not.toHaveBeenCalled()
    })
  })
})
