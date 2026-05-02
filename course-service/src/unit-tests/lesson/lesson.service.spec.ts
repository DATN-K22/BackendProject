import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common'
import { LessonService } from '../../modules/lesson/lesson.service'
import { LessonRepository } from '../../modules/lesson/lesson.repository'
import { MediaClient } from '../../modules/media-service/MediaClient'

const mockLessonRepository = {
  create: jest.fn(),
  findAll: jest.fn(),
  getChapterItemByIdWithValidateUserEnrollment: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  markLearnedChapterItem: jest.fn(),
  isEnrolled: jest.fn()
}

const mockMediaClient = {
  getResourcesByChapterItemId: jest.fn()
}

describe('LessonService', () => {
  let service: LessonService

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonService,
        { provide: LessonRepository, useValue: mockLessonRepository },
        { provide: 'MediaClient', useValue: mockMediaClient }
      ]
    }).compile()

    service = module.get<LessonService>(LessonService)

    Object.values(mockLessonRepository).forEach((fn) => (fn as jest.Mock).mockReset())
    Object.values(mockMediaClient).forEach((fn) => (fn as jest.Mock).mockReset())
  })

  it('should delegate create to repository', async () => {
    mockLessonRepository.create.mockResolvedValue({ id: 1n })

    const result = await service.create({ title: 'Lesson 1' } as any)

    expect(mockLessonRepository.create).toHaveBeenCalledWith({ title: 'Lesson 1' })
    expect(result).toEqual({ id: 1n })
  })

  it('should delegate findAll to repository', async () => {
    mockLessonRepository.findAll.mockResolvedValue([{ id: 1n }])

    const result = await service.findAll({ skip: 0, take: 10 })

    expect(mockLessonRepository.findAll).toHaveBeenCalledWith({ skip: 0, take: 10 })
    expect(result).toEqual([{ id: 1n }])
  })

  it('should return item with resources for non-quiz types', async () => {
    mockLessonRepository.getChapterItemByIdWithValidateUserEnrollment.mockResolvedValue({
      type: 'lesson',
      id: '1',
      title: 'Lesson 1'
    })
    mockMediaClient.getResourcesByChapterItemId.mockResolvedValue({
      data: [{ id: 'r1', name: 'Resource 1' }]
    })

    const result = await service.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

    expect(mockLessonRepository.getChapterItemByIdWithValidateUserEnrollment).toHaveBeenCalledWith('1', 'user-1')
    expect(mockMediaClient.getResourcesByChapterItemId).toHaveBeenCalledWith('1')
    expect(result).toEqual({
      type: 'lesson',
      id: '1',
      title: 'Lesson 1',
      resources: [{ id: 'r1', name: 'Resource 1' }]
    })
  })

  it('should return quiz without resources', async () => {
    mockLessonRepository.getChapterItemByIdWithValidateUserEnrollment.mockResolvedValue({
      type: 'quiz',
      id: '1',
      title: 'Quiz 1',
      questions: []
    })

    const result = await service.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

    expect(mockMediaClient.getResourcesByChapterItemId).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'quiz',
      id: '1',
      title: 'Quiz 1',
      questions: []
    })
  })

  it('should throw ForbiddenException when item not found', async () => {
    mockLessonRepository.getChapterItemByIdWithValidateUserEnrollment.mockResolvedValue(null)

    await expect(service.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')).rejects.toThrow(
      ForbiddenException
    )
  })

  it('should throw when media client fails', async () => {
    mockLessonRepository.getChapterItemByIdWithValidateUserEnrollment.mockResolvedValue({
      type: 'lesson',
      id: '1',
      title: 'Lesson 1'
    })
    mockMediaClient.getResourcesByChapterItemId.mockRejectedValue(new Error('Media service error'))

    await expect(service.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')).rejects.toThrow(
      InternalServerErrorException
    )
  })

  it('should delegate update to repository', async () => {
    mockLessonRepository.update.mockResolvedValue({ id: 1n })

    const result = await service.update('1', { title: 'Updated' } as any)

    expect(mockLessonRepository.update).toHaveBeenCalledWith('1', { title: 'Updated' })
    expect(result).toEqual({ id: 1n })
  })

  it('should delegate remove to repository', async () => {
    mockLessonRepository.remove.mockResolvedValue({ id: 1n })

    const result = await service.remove('1')

    expect(mockLessonRepository.remove).toHaveBeenCalledWith('1')
    expect(result).toEqual({ id: 1n })
  })

  it('should throw when user not enrolled in markLearnedChapterItem', async () => {
    mockLessonRepository.isEnrolled.mockResolvedValue(false)

    await expect(service.markLearnedChapterItem('user-1', '1', '100')).rejects.toThrow(ForbiddenException)
  })

  it('should throw when chapter item not found in markLearnedChapterItem', async () => {
    mockLessonRepository.isEnrolled.mockResolvedValue(true)
    mockLessonRepository.markLearnedChapterItem.mockResolvedValue(null)

    await expect(service.markLearnedChapterItem('user-1', '1', '100')).rejects.toThrow(ForbiddenException)
  })

  it('should mark chapter item as learned', async () => {
    mockLessonRepository.isEnrolled.mockResolvedValue(true)
    mockLessonRepository.markLearnedChapterItem.mockResolvedValue({ id: 100 })

    const result = await service.markLearnedChapterItem('user-1', '1', '100')

    expect(mockLessonRepository.isEnrolled).toHaveBeenCalledWith('100', 'user-1')
    expect(mockLessonRepository.markLearnedChapterItem).toHaveBeenCalledWith('user-1', '1')
    expect(result).toEqual({ id: 100 })
  })
})
