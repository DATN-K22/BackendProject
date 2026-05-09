import { BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { QuestionType } from '@prisma/client'
import { QuizRepository } from '../../modules/quiz/quiz.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  enrollment: {
    findFirst: jest.fn()
  },

  course: {
    findFirst: jest.fn()
  },

  chapterItem: {
    findFirst: jest.fn(),
    findUnique: jest.fn()
  },

  quiz: {
    findUnique: jest.fn()
  },

  quizQuestion: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },

  quizOption: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn()
  },

  quizSession: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },

  chapterItemStatus: {
    upsert: jest.fn()
  },

  $transaction: jest.fn()
}

describe('QuizRepository', () => {
  let repository: QuizRepository

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma
        }
      ]
    }).compile()

    repository = module.get<QuizRepository>(QuizRepository)

    jest.clearAllMocks()
  })

  describe('checkUserAccessToQuiz', () => {
    it('should return true when user is owner', async () => {
      mockPrisma.course.findFirst.mockResolvedValue({
        owner_id: 'user-1'
      })

      const result = await repository.checkUserAccessToQuiz('user-1', '100')

      expect(result).toBe(true)
    })

    it('should return enrollment when enrolled', async () => {
      mockPrisma.course.findFirst.mockResolvedValue({
        owner_id: 'owner-1'
      })

      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 1n
      })

      const result = await repository.checkUserAccessToQuiz('user-1', '100')

      expect(mockPrisma.enrollment.findFirst).toHaveBeenCalled()

      expect(result).toEqual({
        id: 1n
      })
    })

    it('should return null when no access', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(null)

      mockPrisma.enrollment.findFirst.mockResolvedValue(null)

      const result = await repository.checkUserAccessToQuiz('user-1', '100')

      expect(result).toBeNull()
    })
  })

  describe('getQuestions', () => {
    it('should return questions', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        quiz_id: 10n
      })

      mockPrisma.quizQuestion.findMany.mockResolvedValue([
        {
          id: 1n,
          question_text: 'Q1'
        }
      ])

      const result = await repository.getQuestions(100n)

      expect(mockPrisma.quizQuestion.findMany).toHaveBeenCalledWith({
        where: {
          quiz_id: 10n
        },
        include: {
          quiz_options: true
        },
        orderBy: {
          id: 'asc'
        }
      })

      expect(result).toHaveLength(1)
    })

    it('should throw when quiz not found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      await expect(repository.getQuestions(100n)).rejects.toThrow(NotFoundException)
    })
  })

  describe('createQuestion', () => {
    it('should create question with options', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: 'quiz',
        quiz_id: 10n
      })

      const tx = {
        quizQuestion: {
          create: jest.fn().mockResolvedValue({
            id: 1n,
            question_text: 'Question',
            quiz_options: []
          })
        }
      }

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.createQuestion(100n, {
        question_text: 'Question',
        questionType: QuestionType.SINGLE_CHOICE,
        options: [
          {
            option_text: 'A',
            is_correct: true
          }
        ]
      })

      expect(tx.quizQuestion.create).toHaveBeenCalled()

      expect(result.id).toBe(1n)
    })

    it('should throw when chapter item not found', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      await expect(
        repository.createQuestion(100n, {
          question_text: 'Question',
          questionType: QuestionType.SINGLE_CHOICE
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw when chapter item is not quiz', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: 'lesson',
        quiz_id: null
      })

      await expect(
        repository.createQuestion(100n, {
          question_text: 'Question',
          questionType: QuestionType.SINGLE_CHOICE
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw when single choice has multiple correct answers', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: 'quiz',
        quiz_id: 10n
      })

      await expect(
        repository.createQuestion(100n, {
          question_text: 'Question',
          questionType: QuestionType.SINGLE_CHOICE,
          options: [
            {
              option_text: 'A',
              is_correct: true
            },
            {
              option_text: 'B',
              is_correct: true
            }
          ]
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw internal error when transaction fails', async () => {
      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        id: 1n,
        item_type: 'quiz',
        quiz_id: 10n
      })

      mockPrisma.$transaction.mockRejectedValue(new Error('DB error'))

      await expect(
        repository.createQuestion(100n, {
          question_text: 'Question',
          questionType: QuestionType.SINGLE_CHOICE,
          options: [
            {
              option_text: 'A',
              is_correct: true
            }
          ]
        })
      ).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('updateQuestion', () => {
    it('should update question', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n,
        questionType: 'SINGLE_CHOICE' as QuestionType,
        quiz_options: []
      })

      const tx = {
        quizOption: {
          deleteMany: jest.fn()
        },

        quizQuestion: {
          update: jest.fn().mockResolvedValue({
            id: 1n,
            question_text: 'Updated'
          })
        }
      }

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await repository.updateQuestion(1n, {
        question_text: 'Updated'
      })

      expect(result.question_text).toBe('Updated')
    })

    it('should delete options when changing to fill blank', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n,
        questionType: QuestionType.SINGLE_CHOICE,
        quiz_options: []
      })

      const tx = {
        quizOption: {
          deleteMany: jest.fn()
        },

        quizQuestion: {
          update: jest.fn().mockResolvedValue({
            id: 1n
          })
        }
      }

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx))

      await repository.updateQuestion(1n, {
        questionType: QuestionType.FILL_BLANK
      })

      expect(tx.quizOption.deleteMany).toHaveBeenCalled()
    })

    it('should throw when question not found', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue(null)

      await expect(repository.updateQuestion(1n, {})).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteQuestion', () => {
    it('should delete question', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n
      })

      mockPrisma.quizQuestion.delete.mockResolvedValue({
        id: 1n
      })

      const result = await repository.deleteQuestion(1n)

      expect(mockPrisma.quizQuestion.delete).toHaveBeenCalledWith({
        where: {
          id: 1n
        }
      })

      expect(result).toEqual({
        deleted: true,
        questionId: 1n
      })
    })

    it('should throw when question not found', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue(null)

      await expect(repository.deleteQuestion(1n)).rejects.toThrow(NotFoundException)
    })
  })

  describe('addOption', () => {
    it('should add option', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n,
        questionType: QuestionType.MULTI_CHOICE,
        quiz_options: []
      })

      mockPrisma.quizOption.create.mockResolvedValue({
        id: 10n
      })

      const result = await repository.addOption(1n, {
        option_text: 'A',
        is_correct: true
      })

      expect(mockPrisma.quizOption.create).toHaveBeenCalled()

      expect(result.id).toBe(10n)
    })

    it('should throw when fill blank question', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n,
        questionType: QuestionType.FILL_BLANK,
        quiz_options: []
      })

      await expect(
        repository.addOption(1n, {
          option_text: 'A',
          is_correct: true
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw when single choice already has correct answer', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n,
        questionType: QuestionType.SINGLE_CHOICE,
        quiz_options: [
          {
            id: 1n,
            is_correct: true
          }
        ]
      })

      await expect(
        repository.addOption(1n, {
          option_text: 'A',
          is_correct: true
        })
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('updateOption', () => {
    it('should update option', async () => {
      mockPrisma.quizOption.findUnique.mockResolvedValue({
        id: 1n,
        quizQuestion: {
          questionType: QuestionType.SINGLE_CHOICE,
          quiz_options: []
        }
      })

      mockPrisma.quizOption.update.mockResolvedValue({
        id: 1n,
        option_text: 'Updated'
      })

      const result = await repository.updateOption(1n, {
        option_text: 'Updated'
      })

      expect(result.option_text).toBe('Updated')
    })

    it('should throw when option not found', async () => {
      mockPrisma.quizOption.findUnique.mockResolvedValue(null)

      await expect(repository.updateOption(1n, {})).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteOption', () => {
    it('should delete option', async () => {
      mockPrisma.quizOption.findUnique.mockResolvedValue({
        id: 1n,
        is_correct: false,
        quizQuestion: {
          questionType: QuestionType.MULTI_CHOICE,
          quiz_options: []
        }
      })

      mockPrisma.quizOption.delete.mockResolvedValue({
        id: 1n
      })

      const result = await repository.deleteOption(1n)

      expect(mockPrisma.quizOption.delete).toHaveBeenCalled()

      expect(result).toEqual({
        deleted: true,
        optionId: 1n
      })
    })

    it('should prevent deleting last correct answer', async () => {
      mockPrisma.quizOption.findUnique.mockResolvedValue({
        id: 1n,
        is_correct: true,
        quizQuestion: {
          questionType: QuestionType.MULTI_CHOICE,
          quiz_options: [
            {
              id: 1n,
              is_correct: true
            }
          ]
        }
      })

      await expect(repository.deleteOption(1n)).rejects.toThrow(BadRequestException)
    })
  })

  describe('getOrCreateQuizSession', () => {
    beforeEach(() => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({
        quiz_id: 10n
      })
    })

    it('should return existing session', async () => {
      mockPrisma.quizSession.findFirst.mockResolvedValue({
        id: 1n
      })

      const result = await repository.getOrCreateQuizSession('user-1', '100')

      expect(result.isNew).toBe(false)
    })

    it('should create new session', async () => {
      mockPrisma.quizSession.findFirst.mockResolvedValue(null)

      mockPrisma.quizQuestion.findMany.mockResolvedValue([
        {
          id: 1n
        },
        {
          id: 2n
        }
      ])

      mockPrisma.quizSession.create.mockResolvedValue({
        id: 1n,
        questionOrder: [1n, 2n],
        answeredCount: 0,
        totalQuestions: 2,
        skillEstimate: 'basic',
        rightQuestions: 0
      })

      const result = await repository.getOrCreateQuizSession('user-1', '100')

      expect(result.isNew).toBe(true)
    })

    it('should throw when no questions', async () => {
      mockPrisma.quizSession.findFirst.mockResolvedValue(null)

      mockPrisma.quizQuestion.findMany.mockResolvedValue([])

      await expect(repository.getOrCreateQuizSession('user-1', '100')).rejects.toThrow(BadRequestException)
    })
  })

  describe('persistSessionProgress', () => {
    beforeEach(() => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({
        quiz_id: 10n
      })
    })

    it('should update session progress', async () => {
      mockPrisma.quizSession.updateMany.mockResolvedValue({
        count: 1
      })

      await repository.persistSessionProgress('user-1', '100', {
        isCorrect: true,
        skillEstimate: 'basic'
      })

      expect(mockPrisma.quizSession.updateMany).toHaveBeenCalled()
    })

    it('should throw when no active session', async () => {
      mockPrisma.quizSession.updateMany.mockResolvedValue({
        count: 0
      })

      await expect(
        repository.persistSessionProgress('user-1', '100', {
          isCorrect: true,
          skillEstimate: 'basic'
        })
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('getActiveSessionId', () => {
    beforeEach(() => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({
        quiz_id: 10n
      })
    })

    it('should return session id', async () => {
      mockPrisma.quizSession.findFirst.mockResolvedValue({
        id: 1n
      })

      const result = await repository.getActiveSessionId('user-1', '100')

      expect(result).toBe('1')
    })

    it('should return null', async () => {
      mockPrisma.quizSession.findFirst.mockResolvedValue(null)

      const result = await repository.getActiveSessionId('user-1', '100')

      expect(result).toBeNull()
    })
  })

  describe('finishSession', () => {
    it('should finish session and mark chapter item completed', async () => {
      mockPrisma.quizSession.update.mockResolvedValue({
        user_id: 'user-1',
        quiz_id: 10n
      })

      mockPrisma.chapterItem.findUnique.mockResolvedValue({
        id: 100n
      })

      mockPrisma.chapterItemStatus.upsert.mockResolvedValue({
        id: 1n
      })

      await repository.finishSession('1')

      expect(mockPrisma.quizSession.update).toHaveBeenCalled()

      expect(mockPrisma.chapterItemStatus.upsert).toHaveBeenCalled()
    })

    it('should return when chapter item not found', async () => {
      mockPrisma.quizSession.update.mockResolvedValue({
        user_id: 'user-1',
        quiz_id: 10n
      })

      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      await repository.finishSession('1')

      expect(mockPrisma.chapterItemStatus.upsert).not.toHaveBeenCalled()
    })
  })

  describe('getQuizMeta', () => {
    beforeEach(() => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({
        quiz_id: 10n
      })
    })

    it('should return quiz metadata', async () => {
      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 10n
      })

      const result = await repository.getQuizMeta('100')

      expect(result).toEqual({
        id: 10n
      })
    })
  })

  describe('getQuestionWithOptions', () => {
    it('should return question with options', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 1n,
        question_text: 'Q1'
      })

      const result = await repository.getQuestionWithOptions(1n)

      expect(mockPrisma.quizQuestion.findUnique).toHaveBeenCalled()

      expect(result?.id).toBe(1n)
    })
  })

  describe('getQuizHistory', () => {
    beforeEach(() => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({
        quiz_id: 10n
      })
    })

    it('should return history', async () => {
      mockPrisma.quizSession.findMany.mockResolvedValue([
        {
          id: 1n
        }
      ])

      const result = await repository.getQuizHistory('user-1', '100')

      expect(Array.isArray(result)).toBe(true)

      expect(result).toHaveLength(1)
    })
  })
})
