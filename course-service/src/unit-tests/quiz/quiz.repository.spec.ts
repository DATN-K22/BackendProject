import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { QuizRepository } from '../../modules/quiz/quiz.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  chapterItem: {
    findFirst: jest.fn(),
    findUnique: jest.fn()
  },
  enrollment: {
    findFirst: jest.fn()
  },
  quizQuestion: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  quizSession: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  quiz: {
    findUnique: jest.fn()
  },
  chapterItemStatus: {
    upsert: jest.fn()
  }
}

describe('QuizRepository', () => {
  let repository: QuizRepository

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuizRepository, { provide: PrismaService, useValue: mockPrisma }]
    }).compile()

    repository = module.get<QuizRepository>(QuizRepository)
    jest.clearAllMocks()
  })

  describe('checkUserAccessToQuiz', () => {
    it('should return enrollment when user has access', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1n })

      const result = await repository.checkUserAccessToQuiz('user-1', '100')

      expect(result).toEqual({ id: 1n })
    })

    it('should return null when user has no access', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(null)

      const result = await repository.checkUserAccessToQuiz('user-1', '100')

      expect(result).toBeNull()
    })
  })

  describe('getOrCreateQuizSession', () => {
    it('should return existing session when active', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.findFirst.mockResolvedValue({
        id: 1n,
        questionOrder: [10n, 11n, 12n],
        answeredCount: 1,
        totalQuestions: 3,
        skillEstimate: 'basic',
        rightQuestions: 0
      })

      const result = await repository.getOrCreateQuizSession('user-1', '100')

      expect(result.isNew).toBe(false)
      expect(result.quizSession.answeredCount).toBe(1)
    })

    it('should create new session when none exists', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.findFirst.mockResolvedValue(null)
      mockPrisma.quizQuestion.findMany.mockResolvedValue([{ id: 10n }, { id: 11n }, { id: 12n }])
      mockPrisma.quizSession.create.mockResolvedValue({
        id: 1n,
        questionOrder: [10n, 11n, 12n],
        answeredCount: 0,
        totalQuestions: 3,
        skillEstimate: 'basic',
        rightQuestions: 0
      })

      const result = await repository.getOrCreateQuizSession('user-1', '100')

      expect(result.isNew).toBe(true)
      expect(mockPrisma.quizSession.create).toHaveBeenCalled()
    })

    it('should throw when chapter item is not a quiz', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue(null)

      await expect(repository.getOrCreateQuizSession('user-1', '100')).rejects.toThrow(BadRequestException)
    })

    it('should throw when quiz has no questions', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.findFirst.mockResolvedValue(null)
      mockPrisma.quizQuestion.findMany.mockResolvedValue([])

      await expect(repository.getOrCreateQuizSession('user-1', '100')).rejects.toThrow(BadRequestException)
    })
  })

  describe('persistSessionProgress', () => {
    it('should update session with correct answer', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.updateMany.mockResolvedValue({ count: 1 })

      await repository.persistSessionProgress('user-1', '100', {
        isCorrect: true,
        skillEstimate: 'intermediate'
      })

      expect(mockPrisma.quizSession.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', quiz_id: 50n, finish: false },
        data: {
          rightQuestions: { increment: 1 },
          answeredCount: { increment: 1 },
          skillEstimate: 'intermediate'
        }
      })
    })

    it('should update session with wrong answer', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.updateMany.mockResolvedValue({ count: 1 })

      await repository.persistSessionProgress('user-1', '100', {
        isCorrect: false,
        skillEstimate: 'basic'
      })

      expect(mockPrisma.quizSession.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', quiz_id: 50n, finish: false },
        data: {
          rightQuestions: { increment: 0 },
          answeredCount: { increment: 1 },
          skillEstimate: 'basic'
        }
      })
    })

    it('should throw when no active session found', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.updateMany.mockResolvedValue({ count: 0 })

      await expect(
        repository.persistSessionProgress('user-1', '100', {
          isCorrect: true,
          skillEstimate: 'intermediate'
        })
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('getActiveSessionId', () => {
    it('should return session id when active session exists', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.findFirst.mockResolvedValue({ id: 1n })

      const result = await repository.getActiveSessionId('user-1', '100')

      expect(result).toBe('1')
    })

    it('should return null when no active session', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.findFirst.mockResolvedValue(null)

      const result = await repository.getActiveSessionId('user-1', '100')

      expect(result).toBeNull()
    })
  })

  describe('finishSession', () => {
    it('should mark session as finished and update chapter item status', async () => {
      mockPrisma.quizSession.update.mockResolvedValue({
        user_id: 'user-1',
        quiz_id: 50n
      })
      mockPrisma.chapterItem.findUnique.mockResolvedValue({ id: 100n })
      mockPrisma.chapterItemStatus.upsert.mockResolvedValue({ id: 200 })

      await repository.finishSession('1')

      expect(mockPrisma.quizSession.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { finish: true, ended_at: expect.any(Date) },
        select: { user_id: true, quiz_id: true }
      })
      expect(mockPrisma.chapterItemStatus.upsert).toHaveBeenCalled()
    })

    it('should handle missing chapter item gracefully', async () => {
      mockPrisma.quizSession.update.mockResolvedValue({
        user_id: 'user-1',
        quiz_id: 50n
      })
      mockPrisma.chapterItem.findUnique.mockResolvedValue(null)

      await repository.finishSession('1')

      expect(mockPrisma.chapterItemStatus.upsert).not.toHaveBeenCalled()
    })
  })

  describe('getQuizMeta', () => {
    it('should return quiz metadata', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 50n,
        title: 'Chapter 1 Quiz',
        description: 'Test your knowledge'
      })

      const result = await repository.getQuizMeta('100')

      expect(result).toEqual({
        id: 50n,
        title: 'Chapter 1 Quiz',
        description: 'Test your knowledge'
      })
    })
  })

  describe('getQuestionWithOptions', () => {
    it('should return question with all options', async () => {
      mockPrisma.quizQuestion.findUnique.mockResolvedValue({
        id: 10n,
        question_text: 'What is 2+2?',
        questionType: 'multiple',
        quiz_options: [
          { id: 1n, option_text: '4', is_correct: true, description: 'Correct!', reason: 'Basic math' },
          { id: 2n, option_text: '5', is_correct: false, description: 'Wrong', reason: 'Off by one' }
        ]
      })

      const result = await repository.getQuestionWithOptions(10n)

      expect(result).toMatchObject({
        id: 10n,
        question_text: 'What is 2+2?',
        quiz_options: expect.arrayContaining([expect.objectContaining({ id: 1n, is_correct: true })])
      })
    })
  })

  describe('getQuizHistory', () => {
    it('should return quiz history with limit and offset', async () => {
      mockPrisma.chapterItem.findFirst.mockResolvedValue({ quiz_id: 50n })
      mockPrisma.quizSession.findMany.mockResolvedValue([
        {
          id: 1n,
          started_at: new Date(),
          ended_at: new Date(),
          finish: true,
          rightQuestions: 8,
          totalQuestions: 10,
          skillEstimate: 'intermediate'
        }
      ])

      const result = await repository.getQuizHistory('user-1', '100', 10, 0)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        finish: true,
        rightQuestions: 8
      })
    })
  })
})
