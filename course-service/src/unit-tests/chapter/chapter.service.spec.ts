import { Test, TestingModule } from '@nestjs/testing'
import { ChapterService } from '../../modules/chapter/chapter.service'
import { ChapterRepository } from '../../modules/chapter/chaper.repository'

const mockChapterRepository = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  findAllForTOC: jest.fn()
}

describe('ChapterService', () => {
  let service: ChapterService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChapterService, { provide: ChapterRepository, useValue: mockChapterRepository }]
    }).compile()

    service = module.get<ChapterService>(ChapterService)
    jest.clearAllMocks()
  })

  it('should delegate create to repository', async () => {
    const dto = { title: 'Chapter 1' } as any
    mockChapterRepository.create.mockResolvedValue({ id: 1n, ...dto })

    const result = await service.create(dto)

    expect(mockChapterRepository.create).toHaveBeenCalledWith(dto)
    expect(result).toEqual({ id: 1n, ...dto })
  })

  it('should delegate findAllChapterForTOC and calculate progress', async () => {
    mockChapterRepository.findAllForTOC.mockResolvedValue({
      course: { id: '100', title: 'Course A' },
      chapters: [
        {
          id: '1',
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          lessons: [
            { id: '11', isFinished: true },
            { id: '12', isFinished: false }
          ]
        },
        {
          id: '2',
          title: 'Chapter 2',
          status: 'published',
          sort_order: 2,
          lessons: [{ id: '21', isFinished: true }]
        }
      ]
    })

    const result = await service.findAllChapterForTOC('100', 'user-1')

    expect(mockChapterRepository.findAllForTOC).toHaveBeenCalledWith(100n, 'user-1')
    expect(result).toEqual({
      course: { id: '100', title: 'Course A' },
      chapters: [
        {
          id: '1',
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          lessons: [
            { id: '11', isFinished: true },
            { id: '12', isFinished: false }
          ],
          progress: 50
        },
        {
          id: '2',
          title: 'Chapter 2',
          status: 'published',
          sort_order: 2,
          lessons: [{ id: '21', isFinished: true }],
          progress: 100
        }
      ],
      progress: 66.67
    })
  })

  it('should return zero progress when there are no lessons', async () => {
    mockChapterRepository.findAllForTOC.mockResolvedValue({
      course: { id: '100', title: 'Course A' },
      chapters: [
        {
          id: '1',
          title: 'Empty Chapter',
          status: 'draft',
          sort_order: 1,
          lessons: []
        }
      ]
    })

    const result = await service.findAllChapterForTOC('100', 'user-1')

    expect(result.progress).toBe(0)
    expect(result.chapters[0].progress).toBe(0)
  })
})
