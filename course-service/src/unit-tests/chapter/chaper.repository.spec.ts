import { Test, TestingModule } from '@nestjs/testing'
import { ChapterRepository } from '../../modules/chapter/chaper.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  chapter: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  course: {
    findUnique: jest.fn()
  }
}

describe('ChapterRepository', () => {
  let repository: ChapterRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChapterRepository, { provide: PrismaService, useValue: mockPrisma }]
    }).compile()

    repository = module.get<ChapterRepository>(ChapterRepository)
    jest.clearAllMocks()
  })

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should convert string foreign key ids to bigint', async () => {
      const dto = { title: 'Chapter 1', course_id: '10', resource_id: '20' } as any
      const created = { id: 1n, ...dto, course_id: 10n, resource_id: 20n }
      mockPrisma.chapter.create.mockResolvedValue(created)

      const result = await repository.create(dto)

      expect(mockPrisma.chapter.create).toHaveBeenCalledWith({
        data: { ...dto, course_id: 10n, resource_id: 20n }
      })
      expect(result).toEqual(created)
    })

    it('should set course_id to null when not provided', async () => {
      const dto = { title: 'Chapter 1' } as any
      mockPrisma.chapter.create.mockResolvedValue({ id: 1n, ...dto })

      await repository.create(dto)

      expect(mockPrisma.chapter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ course_id: null, resource_id: null })
      })
    })

    it('should set resource_id to null when not provided', async () => {
      const dto = { title: 'Chapter 1', course_id: '10' } as any
      mockPrisma.chapter.create.mockResolvedValue({ id: 1n })

      await repository.create(dto)

      expect(mockPrisma.chapter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ course_id: 10n, resource_id: null })
      })
    })
  })

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should pass undefined where clause when courseId not provided', async () => {
      mockPrisma.chapter.findMany.mockResolvedValue([])

      await repository.findAll({ skip: 0, take: 10 })

      expect(mockPrisma.chapter.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }))
    })

    it('should pass courseId as where clause when provided', async () => {
      mockPrisma.chapter.findMany.mockResolvedValue([])

      await repository.findAll({ courseId: 100n })

      expect(mockPrisma.chapter.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { course_id: 100n } }))
    })

    it('should map chapter items with lesson to lessons array', async () => {
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              sort_order: 2,
              lesson: { id: 11n, title: 'Lesson 1', status: 'published' }
            }
          ]
        }
      ])

      const result = await repository.findAll({ courseId: 100n, skip: 5, take: 10 })

      expect(result[0].lessons).toEqual([
        {
          id: 11n,
          title: 'Lesson 1',
          status: 'published',
          type: 'lesson',
          sort_order: 2,
          isFinished: false
        }
      ])
    })

    it('should filter out chapter items with null lesson', async () => {
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            { sort_order: 1, lesson: { id: 11n, title: 'Lesson 1', status: 'published' } },
            { sort_order: 2, lesson: null }
          ]
        }
      ])

      const result = await repository.findAll({ courseId: 100n })

      expect(result[0].lessons).toHaveLength(1)
      expect(result[0].lessons[0].id).toBe(11n)
    })

    it('should return empty lessons when no chapterItems', async () => {
      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 1n, title: 'Chapter 1', status: 'published', sort_order: 1, chapterItems: [] }
      ])

      const result = await repository.findAll({ courseId: 100n })

      expect(result[0].lessons).toEqual([])
    })

    it('should return empty array when no chapters found', async () => {
      mockPrisma.chapter.findMany.mockResolvedValue([])

      const result = await repository.findAll({ courseId: 100n })

      expect(result).toEqual([])
    })
  })

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return null when chapter does not exist', async () => {
      mockPrisma.chapter.findUnique.mockResolvedValue(null)

      const result = await repository.findOne('1')

      expect(result).toBeNull()
    })

    it('should return chapter with mapped lessons when found', async () => {
      mockPrisma.chapter.findUnique.mockResolvedValue({
        id: 1n,
        title: 'Chapter 1',
        status: 'published',
        sort_order: 1,
        chapterItems: [
          {
            sort_order: 1,
            lesson: { id: 11n, title: 'Lesson 1', status: 'published' }
          }
        ]
      })

      const result = await repository.findOne('1')

      expect(mockPrisma.chapter.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1n } }))
      expect(result).not.toBeNull()
      expect(result!.lessons).toEqual([
        {
          id: 11n,
          title: 'Lesson 1',
          status: 'published',
          type: 'lesson',
          sort_order: 1,
          isFinished: false
        }
      ])
    })

    it('should filter out null lessons in findOne', async () => {
      mockPrisma.chapter.findUnique.mockResolvedValue({
        id: 1n,
        title: 'Chapter 1',
        status: 'published',
        sort_order: 1,
        chapterItems: [
          { sort_order: 1, lesson: { id: 11n, title: 'Lesson 1', status: 'published' } },
          { sort_order: 2, lesson: null }
        ]
      })

      const result = await repository.findOne('1')

      expect(result!.lessons).toHaveLength(1)
    })

    it('should convert string id to bigint when querying', async () => {
      mockPrisma.chapter.findUnique.mockResolvedValue(null)

      await repository.findOne('999')

      expect(mockPrisma.chapter.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 999n } }))
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update chapter and convert ids to bigint', async () => {
      const dto = { title: 'Updated', course_id: '10', resource_id: '20' } as any
      const updated = { id: 1n, ...dto, course_id: 10n, resource_id: 20n }
      mockPrisma.chapter.update.mockResolvedValue(updated)

      const result = await repository.update('1', dto)

      expect(mockPrisma.chapter.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({ course_id: 10n, resource_id: 20n })
      })
      expect(result).toEqual(updated)
    })

    it('should set course_id to undefined when not provided in update', async () => {
      const dto = { title: 'Updated' } as any
      mockPrisma.chapter.update.mockResolvedValue({ id: 1n })

      await repository.update('1', dto)

      expect(mockPrisma.chapter.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({ course_id: undefined, resource_id: undefined })
      })
    })

    it('should convert string id param to bigint', async () => {
      mockPrisma.chapter.update.mockResolvedValue({ id: 42n })

      await repository.update('42', { title: 'Test' } as any)

      expect(mockPrisma.chapter.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42n } }))
    })
  })

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete chapter by bigint id', async () => {
      mockPrisma.chapter.delete.mockResolvedValue({ id: 1n })

      const result = await repository.remove('1')

      expect(mockPrisma.chapter.delete).toHaveBeenCalledWith({ where: { id: 1n } })
      expect(result).toEqual({ id: 1n })
    })

    it('should convert string id to bigint', async () => {
      mockPrisma.chapter.delete.mockResolvedValue({ id: 99n })

      await repository.remove('99')

      expect(mockPrisma.chapter.delete).toHaveBeenCalledWith({ where: { id: 99n } })
    })
  })

  // ─── findAllForTOC ──────────────────────────────────────────────────────────

  describe('findAllForTOC', () => {
    const baseCourse = { id: 100n, title: 'Course A', owner_id: 'owner-1' }

    it('should return null course and empty chapters when course not found', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null)

      const result = await repository.findAllForTOC(100n, 'user-1')

      expect(result).toEqual({ course: null, chapters: [] })
      expect(mockPrisma.chapter.findMany).not.toHaveBeenCalled()
    })

    it('should filter unpublished lessons for non-owner', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 101n,
              item_type: 'lesson',
              sort_order: 1,
              lesson: {
                title: 'Published',
                status: 'published',
                duration: 30,
                short_description: 'short',
                long_description: 'long',
                resources: []
              },
              quiz: null,
              lab: null,
              chapterItemStatuses: []
            },
            {
              id: 102n,
              item_type: 'lesson',
              sort_order: 2,
              lesson: {
                title: 'Draft',
                status: 'draft',
                duration: 20,
                short_description: null,
                long_description: null,
                resources: []
              },
              quiz: null,
              lab: null,
              chapterItemStatuses: []
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'learner-1')

      expect(result.chapters[0].lessons).toHaveLength(1)
      expect(result.chapters[0].lessons[0].title).toBe('Published')
    })

    it('should include all items for owner regardless of status', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 101n,
              item_type: 'lesson',
              sort_order: 1,
              lesson: {
                title: 'Published',
                status: 'published',
                duration: 30,
                short_description: null,
                long_description: null,
                resources: []
              },
              quiz: null,
              lab: null,
              chapterItemStatuses: []
            },
            {
              id: 102n,
              item_type: 'lesson',
              sort_order: 2,
              lesson: {
                title: 'Draft',
                status: 'draft',
                duration: 20,
                short_description: null,
                long_description: null,
                resources: []
              },
              quiz: null,
              lab: null,
              chapterItemStatuses: []
            }
          ]
        }
      ])

      // owner-1 is the owner
      const result = await repository.findAllForTOC(100n, 'owner-1')

      expect(result.chapters[0].lessons).toHaveLength(2)
    })

    it('should map quiz item correctly', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 103n,
              item_type: 'quiz',
              sort_order: 1,
              lesson: null,
              quiz: { title: 'Quiz 1', description: 'Quiz desc' },
              lab: null,
              chapterItemStatuses: []
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'learner-1')

      expect(result.chapters[0].lessons[0]).toEqual({
        id: '103',
        title: 'Quiz 1',
        status: 'published',
        type: 'quiz',
        sort_order: 1,
        duration: 0,
        isFinished: false,
        short_description: 'Quiz desc',
        long_description: 'Quiz desc',
        resources: []
      })
    })

    it('should map lab item correctly for owner', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 104n,
              item_type: 'lab',
              sort_order: 1,
              lesson: null,
              quiz: null,
              lab: {
                title: 'Lab 1',
                status: 'published',
                duration: 60,
                short_description: 'lab short',
                long_description: 'lab long',
                resources: [1n, 2n]
              },
              chapterItemStatuses: [{ id: 1n }]
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'owner-1')

      expect(result.chapters[0].lessons[0]).toEqual({
        id: '104',
        title: 'Lab 1',
        status: 'published',
        type: 'lab',
        sort_order: 1,
        duration: 60,
        isFinished: true,
        short_description: 'lab short',
        long_description: 'lab long',
        resources: ['1', '2']
      })
    })

    it('should filter unpublished lab for non-owner', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 104n,
              item_type: 'lab',
              sort_order: 1,
              lesson: null,
              quiz: null,
              lab: {
                title: 'Lab Draft',
                status: 'draft',
                duration: 60,
                short_description: null,
                long_description: null,
                resources: []
              },
              chapterItemStatuses: []
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'learner-1')

      expect(result.chapters[0].lessons).toHaveLength(0)
    })

    it('should mark isFinished true when chapterItemStatuses is non-empty', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 101n,
              item_type: 'lesson',
              sort_order: 1,
              lesson: {
                title: 'Done Lesson',
                status: 'published',
                duration: 30,
                short_description: null,
                long_description: null,
                resources: []
              },
              quiz: null,
              lab: null,
              chapterItemStatuses: [{ id: 1n }] // completed
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'learner-1')

      expect(result.chapters[0].lessons[0].isFinished).toBe(true)
    })

    it('should convert bigint resource ids to strings', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 101n,
              item_type: 'lesson',
              sort_order: 1,
              lesson: {
                title: 'Lesson',
                status: 'published',
                duration: 30,
                short_description: null,
                long_description: null,
                resources: [1n, 2n, 3n]
              },
              quiz: null,
              lab: null,
              chapterItemStatuses: []
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'learner-1')

      expect(result.chapters[0].lessons[0].resources).toEqual(['1', '2', '3'])
    })

    it('should use status filter in query for non-owner', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([])

      await repository.findAllForTOC(100n, 'learner-1')

      expect(mockPrisma.chapter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'published' })
        })
      )
    })

    it('should NOT use status filter in query for owner', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([])

      await repository.findAllForTOC(100n, 'owner-1')

      const calledWith = mockPrisma.chapter.findMany.mock.calls[0][0]
      expect(calledWith.where).not.toHaveProperty('status')
    })

    it('should return course id and title as strings', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([])

      const result = await repository.findAllForTOC(100n, 'learner-1')

      expect(result.course).toEqual({ id: '100', title: 'Course A' })
    })

    it('should handle item_type with null lesson/quiz/lab (return null, filtered out)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse)
      mockPrisma.chapter.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Chapter 1',
          status: 'published',
          sort_order: 1,
          chapterItems: [
            {
              id: 105n,
              item_type: 'lesson',
              sort_order: 1,
              lesson: null,
              quiz: null,
              lab: null, // lesson is null → filtered
              chapterItemStatuses: []
            }
          ]
        }
      ])

      const result = await repository.findAllForTOC(100n, 'owner-1')

      expect(result.chapters[0].lessons).toHaveLength(0)
    })
  })
})
