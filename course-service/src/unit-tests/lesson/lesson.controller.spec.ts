import { Test, TestingModule } from '@nestjs/testing'
import { LessonController } from '../../modules/lesson/lesson.controller'
import { LessonService } from '../../modules/lesson/lesson.service'

const mockLessonService = {
  create: jest.fn(),
  findAll: jest.fn(),
  getChapterItemByIdWithValidateUserEnrollment: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  markLearnedChapterItem: jest.fn()
}

describe('LessonController', () => {
  let controller: LessonController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LessonController],
      providers: [{ provide: LessonService, useValue: mockLessonService }]
    }).compile()

    controller = module.get<LessonController>(LessonController)
    jest.clearAllMocks()
  })

  it('should delegate create to service', async () => {
    mockLessonService.create.mockResolvedValue({ id: 1n })

    const result = await controller.create({ title: 'Lesson 1' } as any)

    expect(mockLessonService.create).toHaveBeenCalledWith({ title: 'Lesson 1' })
    expect(result).toEqual({ id: 1n })
  })

  it('should parse query params for findAll', async () => {
    mockLessonService.findAll.mockResolvedValue([{ id: 1n }])

    const result = await controller.findAll('5', '10', '20')

    expect(mockLessonService.findAll).toHaveBeenCalledWith({
      skip: 5,
      take: 10,
      chapterId: 20n
    })
    expect(result).toEqual([{ id: 1n }])
  })

  it('should parse query params without chapterId', async () => {
    mockLessonService.findAll.mockResolvedValue([])

    await controller.findAll('0', '10')

    expect(mockLessonService.findAll).toHaveBeenCalledWith({
      skip: 0,
      take: 10,
      chapterId: undefined
    })
  })

  it('should wrap markLearnedChapterItem response in ApiResponse', async () => {
    mockLessonService.markLearnedChapterItem.mockResolvedValue({ id: 100 })

    const result = await controller.markLearnedChapterItem('100', '1', 'user-1')

    expect(mockLessonService.markLearnedChapterItem).toHaveBeenCalledWith('user-1', '1', '100')
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      data: { id: 100 }
    })
  })

  it('should delegate remove to service', async () => {
    mockLessonService.remove.mockResolvedValue({ id: 1n })

    const result = await controller.remove('1')

    expect(mockLessonService.remove).toHaveBeenCalledWith('1')
    expect(result).toEqual({ id: 1n })
  })

  it('should wrap findOne response in ApiResponse', async () => {
    mockLessonService.getChapterItemByIdWithValidateUserEnrollment.mockResolvedValue({
      id: '1',
      type: 'lesson',
      title: 'Lesson 1'
    })

    const result = await controller.findOne('1', 'user-1')

    expect(mockLessonService.getChapterItemByIdWithValidateUserEnrollment).toHaveBeenCalledWith('1', 'user-1')
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      data: {
        id: '1',
        type: 'lesson',
        title: 'Lesson 1'
      }
    })
  })
})
