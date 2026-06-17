import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ChapterItemType } from '@prisma/client'
import { LessonRepository } from '../../modules/lesson/lesson.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  lesson: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  lab: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  quiz: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  chapter: {
    findFirst: jest.fn()
  },
  course: {
    findUnique: jest.fn()
  },
  chapterItem: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
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

const baseChapter = {
  id: 100n,
  title: 'Chapter 1',
  course_id: 1000n
}

const makeChapterItem = (overrides = {}) => ({
  id: 1n,
  item_type: ChapterItemType.lesson,
  title: 'Lesson 1',
  short_description: 'short',
  long_description: 'long',
  status: 'published',
  sort_order: 1,
  duration: 30,
  lesson_id: 10n,
  lab_id: null,
  quiz_id: null,
  lesson: {
    resources: [1n, 2n],
    is_free: false
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
      providers: [
        LessonRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma
        }
      ]
    }).compile()

    repository = module.get<LessonRepository>(LessonRepository)

    jest.clearAllMocks()
  })

  describe('create', () => {
    const makeTx = () => ({
      lesson: {
        create: jest.fn().mockResolvedValue({ id: 10n })
      },
      lab: {
        create: jest.fn().mockResolvedValue({ id: 20n })
      },
      quiz: {
        create: jest.fn().mockResolvedValue({ id: 30n })
      },
      chapterItem: {
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _max: { sort_order: 5 }
        })
      }
    })

    it('should create lesson item', async () => {
      const tx = makeTx()

      tx.chapterItem.create.mockResolvedValue(
        makeChapterItem({
          lesson_id: 10n
        })
      )

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.create({
        chapter_id: '100',
        title: 'Lesson 1',
        short_description: 'short',
        long_description: 'long',
        status: 'published',
        duration: 30,
        resources: ['1', '2'],
        is_free: true,
        lessonType: ChapterItemType.lesson
      } as any)

      expect(tx.lesson.create).toHaveBeenCalledWith({
        data: {
          resources: [1n, 2n],
          is_free: true
        }
      })

      expect(tx.chapterItem.create).toHaveBeenCalled()

      expect(result).toMatchObject({
        id: '1',
        title: 'Lesson 1',
        type: ChapterItemType.lesson
      })
    })

    it('should create lab item', async () => {
      const tx = makeTx()

      tx.chapterItem.create.mockResolvedValue(
        makeChapterItem({
          item_type: ChapterItemType.lab,
          lesson: null,
          lab_id: 20n,
          lab: {
            resources: [5n],
            leaseTemplateId: 'template-1',
            instruction: 'Do lab'
          }
        })
      )

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.create({
        chapter_id: '100',
        title: 'Lab',
        status: 'published',
        resources: ['5'],
        leaseTemplateId: 'template-1',
        instruction: 'Do lab',
        lessonType: ChapterItemType.lab
      } as any)

      expect(tx.lab.create).toHaveBeenCalled()

      expect(result).toMatchObject({
        type: ChapterItemType.lab,
        leaseTemplateId: 'template-1'
      })
    })

    it('should create quiz item', async () => {
      const tx = makeTx()

      tx.chapterItem.create.mockResolvedValue(
        makeChapterItem({
          item_type: ChapterItemType.quiz,
          lesson: null,
          quiz_id: 30n,
          quiz: {
            id: 30n
          }
        })
      )

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.create({
        chapter_id: '100',
        title: 'Quiz',
        status: 'published',
        lessonType: ChapterItemType.quiz,
        questions: [
          {
            question_text: 'Q1',
            questionType: 'single',
            options: [
              {
                option_text: 'A',
                is_correct: true
              }
            ]
          }
        ]
      } as any)

      expect(tx.quiz.create).toHaveBeenCalled()

      expect(result).toMatchObject({
        type: ChapterItemType.quiz,
        quiz_id: '30'
      })
    })

    it('should auto increment sort_order', async () => {
      const tx = makeTx()

      tx.chapterItem.create.mockResolvedValue(makeChapterItem())

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.create({
        chapter_id: '100',
        title: 'Lesson',
        status: 'published'
      } as any)

      expect(tx.chapterItem.aggregate).toHaveBeenCalled()

      expect(tx.chapterItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sort_order: 6
          })
        })
      )
    })
  })

  describe('findAll', () => {
    it('should return mapped chapter items', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([makeChapterItem()])

      const result = await repository.findAll({
        chapterId: 100n,
        skip: 0,
        take: 10
      })

      expect(mockPrisma.chapterItem.findMany).toHaveBeenCalled()

      expect(result).toEqual([
        expect.objectContaining({
          id: '1',
          title: 'Lesson 1',
          type: ChapterItemType.lesson
        })
      ])
    })

    it('should return empty array', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([])

      const result = await repository.findAll({})

      expect(result).toEqual([])
    })
  })

  describe('getChapterItemByIdWithValidateUserEnrollment', () => {
    beforeEach(() => {
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 1
      })

      mockPrisma.course.findUnique.mockResolvedValue({
        owner_id: 'owner-1'
      })
    })

    it('should return null when item not found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })

    it('should return lesson item', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeChapterItem({
          chapter: {
            ...baseChapter,
            course: {
              id: 1000n,
              owner_id: 'owner-1'
            }
          },
          chapterItemStatuses: [{ id: 1 }]
        })
      )

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toMatchObject({
        id: '1',
        type: 'lesson',
        isFinished: true
      })
    })

    it('should return lab item', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeChapterItem({
          item_type: ChapterItemType.lab,
          lesson: null,
          lab: {
            resources: [1n],
            leaseTemplateId: 'template-1',
            instruction: 'instruction'
          },
          chapter: {
            ...baseChapter,
            course: {
              id: 1000n,
              owner_id: 'owner-1'
            }
          }
        })
      )

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toMatchObject({
        type: 'lab',
        leaseTemplateId: 'template-1'
      })
    })

    it('should return quiz item', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeChapterItem({
          item_type: ChapterItemType.quiz,
          lesson: null,
          quiz_id: 30n,
          quiz: {
            quiz_questions: [
              {
                id: 1n,
                question_text: 'Q1',
                questionType: 'single',
                quiz_options: [
                  {
                    id: 1n,
                    option_text: 'A',
                    is_correct: true,
                    description: '',
                    reason: ''
                  }
                ]
              }
            ]
          },
          chapter: {
            ...baseChapter,
            course: {
              id: 1000n,
              owner_id: 'owner-1'
            }
          }
        })
      )

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toMatchObject({
        type: 'quiz'
      })

      expect((result as any).questions).toHaveLength(1)
    })

    it('should return null when user not enrolled', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(
        makeChapterItem({
          chapter: {
            ...baseChapter,
            course: {
              id: 1000n,
              owner_id: 'owner-2'
            }
          }
        })
      )

      mockPrisma.course.findUnique.mockResolvedValue({
        owner_id: 'owner-2'
      })

      mockPrisma.enrollment.findFirst.mockResolvedValue(null)

      const result = await repository.getChapterItemByIdWithValidateUserEnrollment('1', 'user-1')

      expect(result).toBeNull()
    })
  })

  describe('isEnrolled', () => {
    it('should return true when user is course owner', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        owner_id: 'user-1'
      })

      const result = await repository.isEnrolled('1', 'user-1')

      expect(result).toBe(true)
    })

    it('should return true when enrollment exists', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        owner_id: 'owner-1'
      })

      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 1
      })

      const result = await repository.isEnrolled('1', 'user-1')

      expect(result).toBe(true)
    })

    it('should return false when not enrolled', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        owner_id: 'owner-1'
      })

      mockPrisma.enrollment.findFirst.mockResolvedValue(null)

      const result = await repository.isEnrolled('1', 'user-1')

      expect(result).toBe(false)
    })
  })

  describe('update', () => {
    const makeTx = () => ({
      chapterItem: {
        findUnique: jest.fn(),
        update: jest.fn()
      },
      lesson: {
        update: jest.fn()
      },
      lab: {
        update: jest.fn()
      },
      quiz: {
        update: jest.fn()
      }
    })

    it('should update lesson item', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique
        .mockResolvedValueOnce({
          id: 1n,
          item_type: ChapterItemType.lesson,
          lesson_id: 10n
        })
        .mockResolvedValueOnce(makeChapterItem())

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.update('1', {
        title: 'Updated',
        resources: ['1', '2'],
        is_free: true
      } as any)

      expect(tx.chapterItem.update).toHaveBeenCalled()

      expect(tx.lesson.update).toHaveBeenCalledWith({
        where: {
          id: 10n
        },
        data: {
          resources: [1n, 2n],
          is_free: true
        }
      })

      expect(result).toBeDefined()
    })

    it('should throw when chapter item not found', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique.mockResolvedValue(null)

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await expect(repository.update('1', {} as any)).rejects.toThrow(NotFoundException)
    })

    it('should throw when changing lesson type', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: ChapterItemType.lesson,
        lesson_id: 10n
      })

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await expect(
        repository.update('1', {
          lessonType: ChapterItemType.lab
        } as any)
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('updateLessonOrder', () => {
    it('should update lesson order successfully', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([
        {
          id: 1n,
          chapter_id: 100n
        }
      ])

      const tx = {
        chapter: {
          findFirst: jest.fn().mockResolvedValue({
            id: 100n
          })
        },
        chapterItem: {
          update: jest.fn()
        }
      }

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.updateLessonOrder('1000', '100', [
        {
          lesson_id: '1',
          sort_order: 1
        }
      ])

      expect(tx.chapterItem.update).toHaveBeenCalledTimes(2)
    })

    it('should throw when lesson count mismatch', async () => {
      mockPrisma.chapterItem.findMany.mockResolvedValue([])

      await expect(
        repository.updateLessonOrder('1000', '100', [
          {
            lesson_id: '1',
            sort_order: 1
          }
        ])
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('markLearnedChapterItem', () => {
    it('should upsert status', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        id: 1n
      })

      mockPrisma.chapterItemStatus.upsert.mockResolvedValue({
        id: 1
      })

      const result = await repository.markLearnedChapterItem('user-1', '1')

      expect(mockPrisma.chapterItemStatus.upsert).toHaveBeenCalled()

      expect(result).toEqual({
        id: 1
      })
    })

    it('should return null when item not found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      const result = await repository.markLearnedChapterItem('user-1', '1')

      expect(result).toBeNull()
    })
  })

  describe('remove', () => {
    const makeTx = () => ({
      chapterItem: {
        findUnique: jest.fn(),
        delete: jest.fn()
      },
      lesson: {
        delete: jest.fn()
      },
      lab: {
        delete: jest.fn()
      },
      quiz: {
        delete: jest.fn()
      }
    })

    it('should remove lesson', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: ChapterItemType.lesson,
        lesson_id: 10n
      })

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.remove('1')

      expect(tx.lesson.delete).toHaveBeenCalledWith({
        where: {
          id: 10n
        }
      })

      expect(result).toEqual({
        id: '1'
      })
    })

    it('should remove lab', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: ChapterItemType.lab,
        lab_id: 20n
      })

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.remove('1')

      expect(tx.lab.delete).toHaveBeenCalled()
    })

    it('should remove quiz', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: ChapterItemType.quiz,
        quiz_id: 30n
      })

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.remove('1')

      expect(tx.quiz.delete).toHaveBeenCalled()
    })

    it('should throw when item not found', async () => {
      const tx = makeTx()

      tx.chapterItem.findUnique.mockResolvedValue(null)

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await expect(repository.remove('1')).rejects.toThrow(NotFoundException)
    })
  })
})
