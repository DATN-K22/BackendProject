import { Test, TestingModule } from '@nestjs/testing'
import { CourseController } from '../../modules/course/course.controller'
import { CourseService } from '../../modules/course/course.service'

const mockCourseService = {
  create: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  getLatestIncompleteCourseForUser: jest.fn(),
  getRecommendationCourses: jest.fn(),
  getEnrolledCourses: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  enrollUserInCourse: jest.fn()
}

describe('CourseController', () => {
  let controller: CourseController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseController],
      providers: [{ provide: CourseService, useValue: mockCourseService }]
    }).compile()

    controller = module.get<CourseController>(CourseController)
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create a course and return ApiResponse', async () => {
      const createDto = {
        owner_id: 'user-1',
        title: 'AWS Course',
        short_description: 'Learn AWS',
        long_description: 'Detailed AWS course',
        thumbnail_url: 'thumb.jpg',
        price: '100000',
        status: 'draft'
      }
      const created = { id: '6', ...createDto, created_at: new Date() }

      mockCourseService.create.mockResolvedValue(created)

      const result = await controller.create(createDto as any)

      expect(mockCourseService.create).toHaveBeenCalledWith(createDto)
      expect(result).toMatchObject({
        success: true,
        data: created
      })
    })
  })

  describe('findAll', () => {
    it('should get all courses with pagination', async () => {
      const coursesData = {
        data: [
          { id: '1', title: 'Course 1' },
          { id: '2', title: 'Course 2' }
        ],
        meta: {
          totalItems: 2,
          totalPages: 1,
          itemsPerPage: 10,
          currentPage: 1
        }
      }

      mockCourseService.findAll.mockResolvedValue(coursesData)

      const result = await controller.findAll('1', '10')

      expect(mockCourseService.findAll).toHaveBeenCalledWith(1, 10, undefined)
      expect(result).toMatchObject({
        success: true,
        data: coursesData
      })
    })

    it('should filter courses by owner_id', async () => {
      const coursesData = {
        data: [{ id: '1', title: 'Course 1', owner_id: 'user-1' }],
        meta: { totalItems: 1, totalPages: 1, itemsPerPage: 10, currentPage: 1 }
      }

      mockCourseService.findAll.mockResolvedValue(coursesData)

      const result = await controller.findAll('1', '10', 'user-1')

      expect(mockCourseService.findAll).toHaveBeenCalledWith(1, 10, 'user-1')
      expect((result.data as any).data).toHaveLength(1)
    })
  })

  describe('findOne', () => {
    it('should return course detail with user info', async () => {
      const courseDetail = {
        id: '1',
        title: 'Course 1',
        owner_id: 'owner-1',
        isEnrolled: true,
        user: { id: 'owner-1', name: 'Owner', avt_url: 'avatar.jpg' },
        chapters: [{ id: 'ch1', title: 'Chapter 1' }]
      }

      mockCourseService.findOne.mockResolvedValue(courseDetail)

      const result = await controller.findOne('user-1', '1', 'toc')

      expect(mockCourseService.findOne).toHaveBeenCalledWith('1', 'user-1', 'toc')
      expect(result).toMatchObject({
        success: true,
        data: courseDetail
      })
    })

    it('should include chapters when include parameter is set', async () => {
      const courseDetail = {
        id: '1',
        title: 'Course 1',
        chapters: [{ id: 'ch1' }]
      }

      mockCourseService.findOne.mockResolvedValue(courseDetail)

      const result = await controller.findOne('user-1', '1', 'toc')

      expect(result.data).toHaveProperty('chapters')
    })
  })

  describe('update', () => {
    it('should update course and return ApiResponse', async () => {
      const updateDto = { title: 'Updated Course' }
      const updated = { id: '1', ...updateDto }

      mockCourseService.update.mockResolvedValue(updated)

      const result = await controller.update('1', updateDto as any)

      expect(mockCourseService.update).toHaveBeenCalledWith(1, updateDto)
      expect(result).toMatchObject({
        success: true,
        data: updated
      })
    })
  })

  describe('remove', () => {
    it('should delete course', async () => {
      mockCourseService.remove.mockReturnValue('removed')

      const result = await controller.remove('10')

      expect(mockCourseService.remove).toHaveBeenCalledWith(10)

      expect(result).toEqual({
        code: 2000,
        data: null,
        message: 'Delete course successfully',
        success: true,
        timestamp: expect.any(String)
      })
    })
  })
  describe('getLatestIncompleteCourseForUser', () => {
    it('should return latest incomplete courses with creator info', async () => {
      const courses = [
        {
          id: '1',
          title: 'Course 1',
          progress: 30,
          user: { id: 'owner-1', name: 'Owner 1', avt_url: 'avatar1.jpg' }
        }
      ]

      mockCourseService.getLatestIncompleteCourseForUser.mockResolvedValue(courses)

      const result = await controller.getLatestIncompleteCourseForUser('1', '10', 'user-1')

      expect(mockCourseService.getLatestIncompleteCourseForUser).toHaveBeenCalledWith('user-1', 1, 10)
      expect(result).toMatchObject({
        success: true,
        data: courses
      })
    })
  })

  describe('getRecommendationCourses', () => {
    it('should return recommended courses sorted by rating', async () => {
      const courses = [
        { id: '1', title: 'Top Course', rating: 5 },
        { id: '2', title: 'Good Course', rating: 4 }
      ]

      mockCourseService.getRecommendationCourses.mockResolvedValue(courses)

      const result = await controller.getRecommendationCourses('0', '10')

      expect(mockCourseService.getRecommendationCourses).toHaveBeenCalledWith(0, 10)
      expect(result).toMatchObject({
        success: true,
        data: courses
      })
    })
  })

  describe('getEnrolledCourses', () => {
    it('should return courses user has enrolled in', async () => {
      const enrolledCourses = {
        data: [{ id: '1', title: 'Enrolled Course', isEnrolled: true }],
        meta: { totalItems: 1, totalPages: 1, itemsPerPage: 10, currentPage: 1 }
      }

      mockCourseService.getEnrolledCourses.mockResolvedValue(enrolledCourses)

      const result = await controller.getEnrolledCourses('user-1', '1', '10')

      expect(mockCourseService.getEnrolledCourses).toHaveBeenCalledWith('user-1', 1, 10)
      expect(result).toMatchObject({
        success: true,
        data: enrolledCourses
      })
    })
  })

  describe('enrollUserInCourse', () => {
    it('should enroll user in course', async () => {
      mockCourseService.enrollUserInCourse.mockResolvedValue(undefined)

      const result = await controller.enrollUserInCourse({ userId: 'user-1', courseId: 'course-1' })

      expect(mockCourseService.enrollUserInCourse).toHaveBeenCalledWith('user-1', 'course-1')
      expect(result).toMatchObject({
        success: true
      })
    })
  })
})
