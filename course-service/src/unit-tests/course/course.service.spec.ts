import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CourseService } from '../../modules/course/course.service'
import { CourseRepositoy } from '../../modules/course/course.repository'
import { ChapterService } from '../../modules/chapter/chapter.service'
import { IamClient } from '../../modules/iam-service/IamClient'

const mockCourseRepository = {
  create: jest.fn(),
  getLatestIncompleteCourseForUser: jest.fn(),
  getRecommendationCourses: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
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

  it('should delegate create to repository', async () => {
    mockCourseRepository.create.mockResolvedValue({ id: '1' })

    const result = await service.create({ title: 'Course 1' } as any)

    expect(mockCourseRepository.create).toHaveBeenCalledWith({ title: 'Course 1' })
    expect(result).toEqual({ id: '1' })
  })

  it('should return detailed course with chapters when include is set', async () => {
    mockCourseRepository.findOne.mockResolvedValue({
      id: '1',
      owner_id: 'owner-1',
      isEnrolled: false
    })
    mockChapterService.findAllChapterForTOC.mockResolvedValue({ chapters: [{ id: 'c1' }] })
    mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }])

    const result = await service.findOne('1', 'user-1', 'toc')

    expect(mockCourseRepository.findOne).toHaveBeenCalledWith('1', 'user-1')
    expect(mockChapterService.findAllChapterForTOC).toHaveBeenCalledWith('1', 'user-1')
    expect(result).toMatchObject({
      id: '1',
      owner_id: 'owner-1',
      isEnrolled: false,
      user: {
        id: 'owner-1',
        name: 'Owner',
        avt_url: 'avatar.png'
      },
      chapters: { chapters: [{ id: 'c1' }] }
    })
  })

  it('should not load chapters when include is empty', async () => {
    mockCourseRepository.findOne.mockResolvedValue({
      id: '1',
      owner_id: 'owner-1',
      isEnrolled: false
    })
    mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }])

    const result = (await service.findOne('1', 'user-1', ''))!

    expect(mockChapterService.findAllChapterForTOC).not.toHaveBeenCalled()
    expect(result.chapters).toBeNull()
  })

  it('should return latest incomplete courses with creator info', async () => {
    mockCourseRepository.getLatestIncompleteCourseForUser.mockResolvedValue([
      { id: '1', owner_id: 'owner-1', title: 'Course 1', thumbnail_url: 'thumb', progress: 30 }
    ])
    mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }])

    const result = await service.getLatestIncompleteCourseForUser('user-1', 0, 10)

    expect(mockCourseRepository.getLatestIncompleteCourseForUser).toHaveBeenCalledWith('user-1', 0, 10)
    expect(result).toEqual([
      {
        id: '1',
        title: 'Course 1',
        thumbnail_url: 'thumb',
        progress: 30,
        user: {
          name: 'Owner',
          avt_url: 'avatar.png'
        }
      }
    ])
  })

  it('should return recommendation courses with creator info', async () => {
    mockCourseRepository.getRecommendationCourses.mockResolvedValue([
      { id: '1', owner_id: 'owner-1', title: 'Course 1' }
    ])
    mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }])

    const result = await service.getRecommendationCourses(0, 10)

    expect(mockCourseRepository.getRecommendationCourses).toHaveBeenCalledWith(0, 10)
    expect(result).toEqual([
      {
        id: '1',
        owner_id: 'owner-1',
        title: 'Course 1',
        user: { id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }
      }
    ])
  })

  it('should return enrolled courses with meta info', async () => {
    mockCourseRepository.getEnrolledCourses.mockResolvedValue({
      data: [{ id: '1', owner_id: 'owner-1' }],
      totalItems: 11
    })
    mockIamClient.findUserById.mockResolvedValue([{ id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }])

    const result = await service.getEnrolledCourses('user-1', 10, 10)

    expect(result).toEqual({
      data: [
        {
          id: '1',
          owner_id: 'owner-1',
          user: { id: 'owner-1', name: 'Owner', avt_url: 'avatar.png' }
        }
      ],
      meta: {
        totalItems: 11,
        totalPages: 2,
        itemsPerPage: 10,
        currentPage: 2
      }
    })
  })

  it('should enroll user when course is eligible', async () => {
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

  it('should throw when course not found', async () => {
    mockCourseRepository.findCourseById.mockResolvedValue(null)

    await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(NotFoundException)
  })

  it('should throw when course is unpublished', async () => {
    mockCourseRepository.findCourseById.mockResolvedValue({
      id: 1n,
      owner_id: 'owner-1',
      status: 'draft'
    })

    await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(BadRequestException)
  })

  it('should throw when owner tries to enroll', async () => {
    mockCourseRepository.findCourseById.mockResolvedValue({
      id: 1n,
      owner_id: 'user-1',
      status: 'published'
    })

    await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(BadRequestException)
  })

  it('should throw when user already enrolled', async () => {
    mockCourseRepository.findCourseById.mockResolvedValue({
      id: 1n,
      owner_id: 'owner-1',
      status: 'published'
    })
    mockCourseRepository.findEnrollment.mockResolvedValue({ id: 1n })

    await expect(service.enrollUserInCourse('user-1', '1')).rejects.toThrow(ConflictException)
  })
})
