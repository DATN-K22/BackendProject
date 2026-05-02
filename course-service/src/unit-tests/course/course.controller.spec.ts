import { Test, TestingModule } from '@nestjs/testing'
import { CourseController } from '../../modules/course/course.controller'
import { CourseService } from '../../modules/course/course.service'

const mockCourseService = {
  create: jest.fn(),
  findOne: jest.fn(),
  getLatestIncompleteCourseForUser: jest.fn(),
  getRecommendationCourses: jest.fn(),
  getEnrolledCourses: jest.fn(),
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

  it('should wrap findOne response in ApiResponse', async () => {
    mockCourseService.findOne.mockResolvedValue({ id: '1', title: 'Course 1' })

    const result = await controller.findOne('user-1', '1', 'toc')

    expect(mockCourseService.findOne).toHaveBeenCalledWith('1', 'user-1', 'toc')
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      message: "Get course's detail successfully",
      data: { id: '1', title: 'Course 1' }
    })
  })

  it('should parse query params for latest incomplete courses', async () => {
    mockCourseService.getLatestIncompleteCourseForUser.mockResolvedValue([{ id: '1' }])

    const result = await controller.getLatestIncompleteCourseForUser('5', '15', 'user-1')

    expect(mockCourseService.getLatestIncompleteCourseForUser).toHaveBeenCalledWith('user-1', 5, 15)
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      message: 'Get latest incomplete course for user successfully',
      data: [{ id: '1' }]
    })
  })

  it('should parse query params for recommendation courses', async () => {
    mockCourseService.getRecommendationCourses.mockResolvedValue([{ id: '1' }])

    const result = await controller.getRecommendationCourses('2', '8')

    expect(mockCourseService.getRecommendationCourses).toHaveBeenCalledWith(2, 8)
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      message: 'Get recommendation courses successfully',
      data: [{ id: '1' }]
    })
  })

  it('should parse query params for enrolled courses', async () => {
    mockCourseService.getEnrolledCourses.mockResolvedValue({ data: [{ id: '1' }], meta: { totalItems: 1 } })

    const result = await controller.getEnrolledCourses('user-1', '3', '9')

    expect(mockCourseService.getEnrolledCourses).toHaveBeenCalledWith('user-1', 3, 9)
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      message: 'Get enrolled courses successfully',
      data: { data: [{ id: '1' }], meta: { totalItems: 1 } }
    })
  })

  it('should delegate remove to service', () => {
    mockCourseService.remove.mockReturnValue('removed')

    const result = controller.remove('10')

    expect(mockCourseService.remove).toHaveBeenCalledWith(10)
    expect(result).toBe('removed')
  })

  it('should wrap enroll response in ApiResponse', async () => {
    mockCourseService.enrollUserInCourse.mockResolvedValue(undefined)

    const result = await controller.enrollUserInCourse({ userId: 'user-1', courseId: 'course-1' })

    expect(mockCourseService.enrollUserInCourse).toHaveBeenCalledWith('user-1', 'course-1')
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      message: 'Enroll user in course successfully',
      data: undefined
    })
  })
})
