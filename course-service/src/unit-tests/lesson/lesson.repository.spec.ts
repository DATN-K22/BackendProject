import { Test, TestingModule } from '@nestjs/testing'
import { LessonRepository } from '../../modules/lesson/lesson.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  lesson: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  chapterItem: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn()
  },
  chapterItemStatus: {
    upsert: jest.fn()
  },
  enrollment: {
    findFirst: jest.fn()
  },
  $transaction: jest.fn()
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const baseChapter = {
  id: 100n,
  title: 'Chapter 1',
  course_id: 1000n,
  course: { id: 1000n, title: 'Course' }
}

const makeLessonItem = (overrides = {}) => ({
  id: 1n,
  item_type: 'lesson',
  sort_order: 1,
  quiz_id: null,
  lesson: {
    id: 10n,
    title: 'Lesson 1',
    status: 'published',
    duration: 30,
    short_description: 'short',
    long_description: 'long'
  },
  lab: null,
  quiz: null,
  chapter: baseChapter,
  chapterItemStatuses: [],
  ...overrides
})

describe('LessonRepository', () => {
  let repository: LessonRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LessonRepository, { provide: PrismaService, useValue: mockPrisma }]
    }).compile()

    repository = module.get<LessonRepository>(LessonRepository)
    jest.clearAllMocks()
  })

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const makeDto = (overrides = {}) =>
      ({
        chapter_id: '100',
        title: 'Lesson 1',
        short_description: 'short',
        long_description: 'long',
        thumbnail_url: 'thumb',
        status: 'published',
        duration: 30,
        resources: ['1', '2'],
        sort_order: 1,
        ...overrides
      }) as any

    const makeTx = (overrides = {}) => ({
      lesson: { create: jest.fn().mockResolvedValue({ id: 1n }) },
      chapterItem: {
        create: jest.fn().mockResolvedValue({ id: 101n }),
        aggregate: jest.fn().mockResolvedValue({ _max: { sort_order: 0 } })
      },
      ...overrides
    })

    it('should create lesson and chapter item in transaction', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.create(makeDto())

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(tx.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Lesson 1',
            duration: 30,
            resources: [1n, 2n]
          })
        })
      )
      expect(tx.chapterItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            chapter_id: 100n,
            item_type: 'lesson',
            sort_order: 1
          })
        })
      )
      expect(result).toEqual({ id: 1n })
    })

    it('should default duration to 0 when not provided', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.create(makeDto({ duration: undefined }))

      expect(tx.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ duration: 0 }) })
      )
    })

    it('should default resources to empty array when not provided', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.create(makeDto({ resources: undefined }))

      expect(tx.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ resources: [] }) })
      )
    })

    it('should use auto sort_order from aggregate when sort_order not provided', async () => {
      const tx = makeTx()
      tx.chapterItem.aggregate.mockResolvedValue({ _max: { sort_order: 5 } })
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.create(makeDto({ sort_order: undefined }))

      expect(tx.chapterItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sort_order: 6 }) })
      )
    })

    it('should default sort_order to 1 when aggregate returns null', async () => {
      const tx = makeTx()
      tx.chapterItem.aggregate.mockResolvedValue({ _max: { sort_order: null } })
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.create(makeDto({ sort_order: undefined }))

      expect(tx.chapterItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sort_order: 1 }) })
      )
    })
  })

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should find chapter items with lesson data when chapterId provided', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([
        {
          id: 1n,
          sort_order: 1,
          lesson: { id: 10n, title: 'Lesson 1', status: 'published' },
          chapter: { id: 100n, title: 'Chapter 1', course_id: 1000n }
        }
      ])

      const result = await repository.findAll({ chapterId: 100n, skip: 0, take: 10 })

      expect(mockPrisma.chapterItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { item_type: 'lesson', chapter_id: 100n }
        })
      )
      expect(result).toEqual([
        {
          id: 10n,
          title: 'Lesson 1',
          status: 'published',
          type: 'lesson',
          sort_order: 1,
          chapter: { id: 100n, title: 'Chapter 1', course_id: 1000n }
        }
      ])
    })

    it('should query without chapter_id filter when chapterId not provided', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([])

      await repository.findAll({ skip: 0, take: 10 })

      expect(mockPrisma.chapterItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { item_type: 'lesson' }
        })
      )
    })

    it('should filter out items with null lesson', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([
        {
          id: 1n,
          sort_order: 1,
          lesson: { id: 10n, title: 'Lesson 1', status: 'published' },
          chapter: { id: 100n, title: 'Chapter 1', course_id: 1000n }
        },
        {
          id: 2n,
          sort_order: 2,
          lesson: null,
          chapter: { id: 100n, title: 'Chapter 1', course_id: 1000n }
        }
      ])

      const result = await repository.findAll({ chapterId: 100n })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(10n)
    })

    it('should return empty array when no items found', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([])

      const result = await repository.findAll({ chapterId: 100n })

      expect(result).toEqual([])
    })
  })

  // ─── getChapterItemByIdWithValidateUserEnrollment ────────────────────────────

  describe('getChapterItemByIdWithValidateUserEnrollment', () => {
    beforeEach(() => {
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1 })
    })

    it('should return null when chapterItem not found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })

    it('should return null when course_id is missing', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        ...makeLessonItem(),
        chapter: { ...baseChapter, course_id: null }
      })

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })

    it('should return null when user is not enrolled', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(makeLessonItem())
      mockPrisma.enrollment.findFirst.mockResolvedValue(null)

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })

    it('should return mapped lesson item when enrolled', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(makeLessonItem({ chapterItemStatuses: [{ id: 1 }] }))

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toMatchObject({
        id: '1',
        title: 'Lesson 1',
        status: 'published',
        type: 'lesson',
        sort_order: 1,
        short_description: 'short',
        long_description: 'long',
        duration: 30,
        isFinished: true
      })
    })

    it('should default short/long description to empty string when null', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeLessonItem({
          lesson: {
            id: 10n,
            title: 'Lesson',
            status: 'published',
            duration: 30,
            short_description: null,
            long_description: null
          }
        })
      )

      const result = (await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')) as any

      expect(result.short_description).toBe('')
      expect(result.long_description).toBe('')
    })

    it('should return mapped lab item when item_type is lab', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeLessonItem({
          item_type: 'lab',
          lesson: null,
          lab: {
            title: 'Lab 1',
            status: 'published',
            duration: 60,
            short_description: 'lab short',
            long_description: 'lab long',
            leaseTemplateId: 'template-123'
          }
        })
      )

      const result = (await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')) as any

      expect(result).toMatchObject({
        id: '1',
        title: 'Lab 1',
        type: 'lab',
        status: 'published',
        duration: 60,
        short_description: 'lab short',
        long_description: 'lab long',
        leaseTemplateId: 'template-123'
      })
    })

    it('should default lab leaseTemplateId to undefined when null', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeLessonItem({
          item_type: 'lab',
          lesson: null,
          lab: {
            title: 'Lab 1',
            status: 'published',
            duration: 60,
            short_description: null,
            long_description: null,
            leaseTemplateId: null
          }
        })
      )

      const result = (await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')) as any

      expect(result.leaseTemplateId).toBeUndefined()
    })

    it('should return mapped quiz item when item_type is quiz', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeLessonItem({
          item_type: 'quiz',
          lesson: null,
          quiz_id: 200n,
          quiz: {
            title: 'Quiz 1',
            description: 'Quiz desc',
            quiz_questions: [
              {
                id: 1n,
                question_text: 'Q1?',
                questionType: 'single',
                quiz_options: [{ id: 1n, option_text: 'A', is_correct: true, description: 'desc', reason: 'reason' }]
              }
            ]
          }
        })
      )

      const result = (await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')) as any

      expect(result).toMatchObject({
        id: '1',
        title: 'Quiz 1',
        type: 'quiz',
        status: 'published',
        duration: 0,
        short_description: 'Quiz desc',
        long_description: 'Quiz desc'
      })
      expect(result.questions).toHaveLength(1)
      expect(result.questions[0]).toMatchObject({
        id: '1',
        question_text: 'Q1?',
        questionType: 'single',
        options: [{ id: '1', option_text: 'A', is_correct: true, description: 'desc', reason: 'reason' }]
      })
    })

    it('should return null when item_type is quiz but quiz is null', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeLessonItem({
          item_type: 'quiz',
          lesson: null,
          quiz_id: 200n,
          quiz: null
        })
      )

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })

    it('should return null when item_type does not match any case', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(makeLessonItem({ item_type: 'unknown', lesson: null }))

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })

    it('should return null when item_type is lesson but lesson is null', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(makeLessonItem({ lesson: null }))

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })
  })

  // ─── isEnrolled ─────────────────────────────────────────────────────────────

  describe('isEnrolled', () => {
    it('should return true when enrollment exists', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1 })

      const result = await repository.isEnrolled('1', 'user-1')

      expect(mockPrisma.enrollment.findFirst).toHaveBeenCalledWith({
        where: { user_id: 'user-1', course_id: 1n },
        select: { id: true }
      })
      expect(result).toBe(true)
    })

    it('should return false when enrollment not found', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(null)

      const result = await repository.isEnrolled('1', 'user-1')

      expect(result).toBe(false)
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const makeTx = () => ({
      lesson: { update: jest.fn().mockResolvedValue({ id: 1n, title: 'Updated' }) },
      chapterItem: { update: jest.fn().mockResolvedValue({}) }
    })

    it('should update lesson fields and chapterItem when chapter_id provided', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.update('1', {
        title: 'Updated',
        chapter_id: '200',
        sort_order: 3
      } as any)

      expect(tx.lesson.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1n } }))
      expect(tx.chapterItem.update).toHaveBeenCalledWith({
        where: { lesson_id: 1n },
        data: { chapter_id: 200n, sort_order: 3 }
      })
      expect(result).toEqual({ id: 1n, title: 'Updated' })
    })

    it('should update chapterItem when only sort_order is provided', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.update('1', { sort_order: 5 } as any)

      expect(tx.chapterItem.update).toHaveBeenCalledWith({
        where: { lesson_id: 1n },
        data: { sort_order: 5 }
      })
    })

    it('should NOT update chapterItem when neither chapter_id nor sort_order provided', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.update('1', { title: 'Only title' } as any)

      expect(tx.chapterItem.update).not.toHaveBeenCalled()
    })

    it('should convert resources to bigint array', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.update('1', { resources: ['1', '2', '3'] } as any)

      expect(tx.lesson.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resources: [1n, 2n, 3n] })
        })
      )
    })

    it('should only include defined fields in update data', async () => {
      const tx = makeTx()
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.update('1', { title: 'New Title' } as any)

      const calledData = tx.lesson.update.mock.calls[0][0].data
      expect(calledData).toHaveProperty('title', 'New Title')
      expect(calledData).not.toHaveProperty('status')
      expect(calledData).not.toHaveProperty('duration')
    })
  })

  // ─── markLearnedChapterItem ──────────────────────────────────────────────────

  describe('markLearnedChapterItem', () => {
    it('should upsert chapter item status when item found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({ id: 1n })
      mockPrisma.chapterItemStatus.upsert.mockResolvedValue({ id: 100 })

      const result = await repository.markLearnedChapterItem('user-1', '1')

      expect(mockPrisma.chapterItemStatus.upsert).toHaveBeenCalledWith({
        where: {
          uq_chapter_item_status_user_item: {
            user_id: 'user-1',
            chapter_item_id: 1n
          }
        },
        create: {
          user_id: 'user-1',
          chapter_item_id: 1n,
          completed: true,
          updated_at: expect.any(Date)
        },
        update: {
          completed: true,
          updated_at: expect.any(Date)
        }
      })
      expect(result).toEqual({ id: 100 })
    })

    it('should return null when chapter item not found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      const result = await repository.markLearnedChapterItem('user-1', '1')

      expect(mockPrisma.chapterItemStatus.upsert).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete lesson by bigint id', async () => {
      mockPrisma.lesson.delete.mockResolvedValue({ id: 1n })

      const result = await repository.remove('1')

      expect(mockPrisma.lesson.delete).toHaveBeenCalledWith({ where: { id: 1n } })
      expect(result).toEqual({ id: 1n })
    })

    it('should convert string id to bigint', async () => {
      mockPrisma.lesson.delete.mockResolvedValue({ id: 99n })

      await repository.remove('99')

      expect(mockPrisma.lesson.delete).toHaveBeenCalledWith({ where: { id: 99n } })
    })
  })
})
