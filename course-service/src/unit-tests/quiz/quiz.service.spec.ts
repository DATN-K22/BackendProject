import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { QuizService } from '../../modules/quiz/quiz.service'
import { QuizRepository } from '../../modules/quiz/quiz.repository'
import { RedisCacheService } from '../../modules/redis/redis-cache.service'

const mockQuizRepository = {
  checkUserAccessToQuiz: jest.fn(),
  getOrCreateQuizSession: jest.fn(),
  getQuestionWithOptions: jest.fn(),
  persistSessionProgress: jest.fn(),
  finishSession: jest.fn(),
  getActiveSessionId: jest.fn(),
  getQuizMeta: jest.fn(),
  getQuizHistory: jest.fn()
}

const mockRedisCache = {
  set: jest.fn(),
  get: jest.fn()
}

describe('QuizService', () => {
  let service: QuizService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        { provide: QuizRepository, useValue: mockQuizRepository },
        { provide: RedisCacheService, useValue: mockRedisCache }
      ]
    }).compile()

    service = module.get<QuizService>(QuizService)
    jest.clearAllMocks()
  })

  describe('takeQuiz', () => {
    it('should throw when user has no access', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue(null)

      await expect(service.takeQuiz('user-1', '100')).rejects.toThrow(ForbiddenException)
    })

    it('should create new session and return first question', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n, 12n],
          answeredCount: 0,
          totalQuestions: 3,
          skillEstimate: 'basic',
          rightQuestions: 0
        },
        isNew: true,
        quizId: '50'
      })
      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 10n,
        question_text: 'Question 1?',
        questionType: 'multiple',
        quiz_options: [
          { id: 1n, option_text: 'Option A', is_correct: true, description: 'Correct', reason: 'Answer' },
          { id: 2n, option_text: 'Option B', is_correct: false, description: 'Wrong', reason: 'Not right' }
        ]
      })
      mockRedisCache.get.mockResolvedValue(null)

      const result = await service.takeQuiz('user-1', '100')

      expect(result).toMatchObject({
        type: 'question',
        progress: { current: 1, total: 3, percentComplete: 0 }
      })
      if (result.type === 'question') {
        expect(result.question).toMatchObject({
          id: '10',
          questionText: 'Question 1?',
          options: expect.arrayContaining([expect.objectContaining({ optionText: 'Option A' })])
        })
        // Verify answer fields not exposed before submission
        expect(result.question.options[0]).not.toHaveProperty('is_correct')
        expect(result.question.options[0]).not.toHaveProperty('reason')
      }
    })

    it('should resume existing session from cache', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n, 12n],
          answeredCount: 1,
          totalQuestions: 3,
          skillEstimate: 'intermediate',
          rightQuestions: 1
        },
        isNew: false,
        quizId: '50'
      })
      const cache = {
        sessionId: '1',
        questionStates: [
          { questionId: '10', selectedOptionId: '1', isCorrect: true },
          { questionId: '11', selectedOptionId: null, isCorrect: null },
          { questionId: '12', selectedOptionId: null, isCorrect: null }
        ],
        currentIndex: 1,
        score: 1,
        recentResults: [true]
      }
      mockRedisCache.get.mockResolvedValue(cache)
      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 11n,
        question_text: 'Question 2?',
        questionType: 'multiple',
        quiz_options: [{ id: 3n, option_text: 'Option C', is_correct: true, description: 'Correct', reason: 'Answer' }]
      })

      const result = await service.takeQuiz('user-1', '100')

      expect(result).toMatchObject({
        type: 'question',
        progress: { current: 2, total: 3 }
      })
    })

    it('should return summary when all questions answered', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n],
          answeredCount: 2,
          totalQuestions: 2,
          skillEstimate: 'advanced',
          rightQuestions: 2
        },
        isNew: false,
        quizId: '50'
      })
      const cache = {
        sessionId: '1',
        questionStates: [
          { questionId: '10', selectedOptionId: '1', isCorrect: true },
          { questionId: '11', selectedOptionId: '3', isCorrect: true }
        ],
        currentIndex: 2,
        score: 2,
        recentResults: [true, true]
      }
      mockRedisCache.get.mockResolvedValue(cache)

      const result = await service.takeQuiz('user-1', '100')

      expect(result).toMatchObject({
        type: 'summary',
        accuracy: 100,
        correct: 2,
        total: 2
      })
    })
  })

  describe('submitAnswer', () => {
    it('should throw when user has no access', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue(null)

      await expect(service.submitAnswer('user-1', '100', '10', '1')).rejects.toThrow(ForbiddenException)
    })

    it('should throw when question not found', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuestionWithOptions.mockResolvedValue(null)

      await expect(service.submitAnswer('user-1', '100', '10', '1')).rejects.toThrow(NotFoundException)
    })

    it('should throw when option not found', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 10n,
        question_text: 'Question?',
        questionType: 'multiple',
        quiz_options: [{ id: 1n, option_text: 'A', is_correct: true, description: 'Correct', reason: 'Answer' }]
      })

      await expect(service.submitAnswer('user-1', '100', '10', '999')).rejects.toThrow(NotFoundException)
    })

    it('should return feedback with next question when correct and more questions remain', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuestionWithOptions
        .mockResolvedValueOnce({
          id: 10n,
          question_text: 'Question 1?',
          questionType: 'multiple',
          quiz_options: [
            { id: 1n, option_text: 'A', is_correct: true, description: 'Correct', reason: 'Math' },
            { id: 2n, option_text: 'B', is_correct: false, description: 'Wrong', reason: 'Off' }
          ]
        })
        .mockResolvedValueOnce({
          id: 11n,
          question_text: 'Question 2?',
          questionType: 'multiple',
          quiz_options: [{ id: 3n, option_text: 'C', is_correct: true, description: 'Correct', reason: 'Answer' }]
        })

      mockQuizRepository.getActiveSessionId.mockResolvedValue('1')
      const cache = {
        sessionId: '1',
        questionStates: [
          { questionId: '10', selectedOptionId: null, isCorrect: null },
          { questionId: '11', selectedOptionId: null, isCorrect: null }
        ],
        currentIndex: 0,
        score: 0,
        recentResults: []
      }
      mockRedisCache.get.mockResolvedValue(cache)

      const result = await service.submitAnswer('user-1', '100', '10', '1')

      expect(result).toMatchObject({
        type: 'feedback_with_next',
        feedback: { isCorrect: true, correctOptionId: '1' },
        progress: { current: 2, total: 2 }
      })
      expect(result.nextQuestion).toMatchObject({
        questionText: 'Question 2?'
      })
      expect(mockQuizRepository.persistSessionProgress).toHaveBeenCalledWith('user-1', '100', {
        isCorrect: true,
        skillEstimate: expect.any(String)
      })
    })

    it('should return feedback_final when last question answered correctly', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 11n,
        question_text: 'Question 2?',
        questionType: 'multiple',
        quiz_options: [{ id: 3n, option_text: 'C', is_correct: true, description: 'Correct', reason: 'Answer' }]
      })

      mockQuizRepository.getActiveSessionId.mockResolvedValue('1')
      const cache = {
        sessionId: '1',
        questionStates: [
          { questionId: '10', selectedOptionId: '1', isCorrect: true },
          { questionId: '11', selectedOptionId: null, isCorrect: null }
        ],
        currentIndex: 1,
        score: 1,
        recentResults: [true]
      }
      mockRedisCache.get.mockResolvedValue(cache)

      const result = await service.submitAnswer('user-1', '100', '11', '3')

      expect(result).toMatchObject({
        type: 'feedback_final',
        feedback: { isCorrect: true },
        summary: { type: 'summary', accuracy: 100 }
      })
      expect(mockQuizRepository.finishSession).toHaveBeenCalledWith('1')
    })

    it('should return feedback_only when cache evicted', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 10n,
        question_text: 'Question?',
        questionType: 'multiple',
        quiz_options: [{ id: 1n, option_text: 'A', is_correct: true, description: 'Correct', reason: 'Answer' }]
      })

      mockQuizRepository.getActiveSessionId.mockResolvedValue(null)

      const result = await service.submitAnswer('user-1', '100', '10', '1')

      expect(result).toMatchObject({
        type: 'feedback_only',
        feedback: { isCorrect: true }
      })
      expect(mockQuizRepository.persistSessionProgress).toHaveBeenCalled()
    })
  })

  describe('getQuizOverview', () => {
    it('should throw when user has no access', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue(null)

      await expect(service.getQuizOverview('user-1', '100')).rejects.toThrow(ForbiddenException)
    })

    it('should return quiz overview with history', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuizMeta.mockResolvedValue({
        id: 50n,
        title: 'Chapter 1 Quiz',
        description: 'Test knowledge'
      })
      mockQuizRepository.getQuizHistory.mockResolvedValue([
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

      const result = await service.getQuizOverview('user-1', '100', 10, 0)

      expect(result).toMatchObject({
        quiz: {
          title: 'Chapter 1 Quiz'
        },
        history: expect.arrayContaining([
          expect.objectContaining({
            score: '8/10',
            completed: true
          })
        ])
      })
    })

    it('should throw when quiz not found', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({ id: 1n })
      mockQuizRepository.getQuizMeta.mockResolvedValue(null)
      mockQuizRepository.getQuizHistory.mockResolvedValue([])

      await expect(service.getQuizOverview('user-1', '100')).rejects.toThrow(NotFoundException)
    })
  })
})
