import { Test, TestingModule } from '@nestjs/testing'
import { ChapterController } from '../../modules/chapter/chapter.controller'
import { ChapterService } from '../../modules/chapter/chapter.service'

const mockChapterService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  findAllChapterForTOC: jest.fn()
}

describe('ChapterController', () => {
  let controller: ChapterController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChapterController],
      providers: [{ provide: ChapterService, useValue: mockChapterService }]
    }).compile()

    controller = module.get<ChapterController>(ChapterController)
    jest.clearAllMocks()
  })

  it('should parse query params for findAll', async () => {
    mockChapterService.findAll.mockResolvedValue([{ id: 1n }])

    const result = await controller.findAll('5', '10', '20')

    expect(mockChapterService.findAll).toHaveBeenCalledWith({
      skip: 5,
      take: 10,
      courseId: 20n
    })
    expect(result).toEqual([{ id: 1n }])
  })

  it('should wrap toc response in ApiResponse', async () => {
    mockChapterService.findAllChapterForTOC.mockResolvedValue({
      course: { id: '100', title: 'Course A' },
      chapters: [],
      progress: 12.5
    })

    const result = await controller.findAllChapterForTOC('user-1', '100')

    expect(mockChapterService.findAllChapterForTOC).toHaveBeenCalledWith('100', 'user-1')
    expect(result).toMatchObject({
      success: true,
      code: 2000,
      message: 'Get list of chapter by course id successfully',
      data: {
        course: { id: '100', title: 'Course A' },
        chapters: [],
        progress: 12.5
      }
    })
  })
})
