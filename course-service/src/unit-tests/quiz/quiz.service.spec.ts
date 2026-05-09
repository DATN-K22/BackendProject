import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { QuizRepository } from '../../modules/quiz/quiz.repository'
import { QuizService } from '../../modules/quiz/quiz.service'
import { RedisCacheService } from '../../modules/redis/redis-cache.service'

describe('QuizService', () => {
  let service: QuizService

  const mockQuizRepository = {
    checkUserAccessToQuiz: jest.fn(),
    getOrCreateQuizSession: jest.fn(),
    getQuestionWithOptions: jest.fn(),
    persistSessionProgress: jest.fn(),
    finishSession: jest.fn(),
    getActiveSessionId: jest.fn(),
    getQuizMeta: jest.fn(),
    getQuizHistory: jest.fn(),

    getQuestions: jest.fn(),
    createQuestion: jest.fn(),
    updateQuestion: jest.fn(),
    deleteQuestion: jest.fn(),

    addOption: jest.fn(),
    updateOption: jest.fn(),
    deleteOption: jest.fn()
  }

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn()
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        {
          provide: QuizRepository,
          useValue: mockQuizRepository
        },
        {
          provide: RedisCacheService,
          useValue: mockRedis
        }
      ]
    }).compile()

    service = module.get<QuizService>(QuizService)

    jest.clearAllMocks()
  })

  // =========================================================
  // CRUD QUESTION
  // =========================================================

  describe('getQuestions', () => {
    it('should return questions', async () => {
      const questions = [
        {
          id: 1n,
          question_text: 'Question 1'
        }
      ]

      mockQuizRepository.getQuestions.mockResolvedValue(questions)

      const result = await service.getQuestions('100')

      expect(mockQuizRepository.getQuestions).toHaveBeenCalledWith(100n)
      expect(result).toEqual(questions)
    })
  })

  describe('createQuestion', () => {
    it('should create question', async () => {
      const dto = {
        question_text: 'What is NestJS?',
        questionType: 'multiple',
        options: [
          {
            option_text: 'Framework',
            is_correct: true
          }
        ]
      }

      const created = {
        id: 1n,
        ...dto
      }

      mockQuizRepository.createQuestion.mockResolvedValue(created)

      const result = await service.createQuestion('100', dto as any)

      expect(mockQuizRepository.createQuestion).toHaveBeenCalledWith(100n, dto)
      expect(result).toEqual(created)
    })
  })

  describe('updateQuestion', () => {
    it('should update question', async () => {
      const dto = {
        question_text: 'Updated',
        questionType: 'fill_blank'
      }

      const updated = {
        id: 1n,
        ...dto
      }

      mockQuizRepository.updateQuestion.mockResolvedValue(updated)

      const result = await service.updateQuestion('1', dto as any)

      expect(mockQuizRepository.updateQuestion).toHaveBeenCalledWith(1n, dto)
      expect(result).toEqual(updated)
    })
  })

  describe('deleteQuestion', () => {
    it('should delete question', async () => {
      mockQuizRepository.deleteQuestion.mockResolvedValue({
        success: true
      })

      const result = await service.deleteQuestion('1')

      expect(mockQuizRepository.deleteQuestion).toHaveBeenCalledWith(1n)
      expect(result).toEqual({
        success: true
      })
    })
  })

  // =========================================================
  // CRUD OPTION
  // =========================================================

  describe('addOption', () => {
    it('should add option', async () => {
      const dto = {
        option_text: 'Option A',
        is_correct: true
      }

      const created = {
        id: 10n,
        ...dto
      }

      mockQuizRepository.addOption.mockResolvedValue(created)

      const result = await service.addOption('1', dto as any)

      expect(mockQuizRepository.addOption).toHaveBeenCalledWith(1n, dto)
      expect(result).toEqual(created)
    })
  })

  describe('updateOption', () => {
    it('should update option', async () => {
      const dto = {
        option_text: 'Updated Option',
        is_correct: false
      }

      const updated = {
        id: 10n,
        ...dto
      }

      mockQuizRepository.updateOption.mockResolvedValue(updated)

      const result = await service.updateOption('10', dto as any)

      expect(mockQuizRepository.updateOption).toHaveBeenCalledWith(10n, dto)
      expect(result).toEqual(updated)
    })
  })

  describe('deleteOption', () => {
    it('should delete option', async () => {
      mockQuizRepository.deleteOption.mockResolvedValue({
        success: true
      })

      const result = await service.deleteOption('10')

      expect(mockQuizRepository.deleteOption).toHaveBeenCalledWith(10n)
      expect(result).toEqual({
        success: true
      })
    })
  })

  // =========================================================
  // TAKE QUIZ
  // =========================================================

  describe('takeQuiz', () => {
    it('should throw ForbiddenException when user has no access', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue(null)

      await expect(service.takeQuiz('user-1', '100')).rejects.toThrow(ForbiddenException)
    })

    it('should create new session and return first question', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n],
          answeredCount: 0,
          rightQuestions: 0,
          totalQuestions: 2,
          skillEstimate: 'basic'
        },
        isNew: true
      })

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 10n,
        question_text: 'Question 1?',
        questionType: 'multiple',
        quiz_options: [
          {
            id: 1n,
            option_text: 'A',
            is_correct: true,
            reason: 'Correct'
          }
        ]
      })

      const result = await service.takeQuiz('user-1', '100')

      expect(mockRedis.set).toHaveBeenCalled()

      expect(result).toMatchObject({
        type: 'question',
        progress: {
          current: 1,
          total: 2,
          percentComplete: 0
        }
      })

      if (result.type === 'question') {
        expect(result.question).toMatchObject({
          id: '10',
          questionText: 'Question 1?'
        })

        expect(result.question.options[0]).not.toHaveProperty('is_correct')
      }
    })

    it('should resume existing cached session', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n],
          answeredCount: 1,
          rightQuestions: 1,
          totalQuestions: 2,
          skillEstimate: 'intermediate'
        },
        isNew: false
      })

      mockRedis.get.mockResolvedValue({
        sessionId: '1',
        questionStates: [
          {
            questionId: '10',
            selectedOptionId: '1',
            isCorrect: true
          },
          {
            questionId: '11',
            selectedOptionId: null,
            isCorrect: null
          }
        ],
        currentIndex: 1,
        score: 1,
        recentResults: [true]
      })

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 11n,
        question_text: 'Question 2?',
        questionType: 'multiple',
        quiz_options: []
      })

      const result = await service.takeQuiz('user-1', '100')

      expect(result).toMatchObject({
        type: 'question',
        progress: {
          current: 2,
          total: 2
        }
      })
    })

    it('should reconstruct session when cache missing', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n],
          answeredCount: 1,
          rightQuestions: 1,
          totalQuestions: 2,
          skillEstimate: 'intermediate'
        },
        isNew: false
      })

      mockRedis.get.mockResolvedValue(null)

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 11n,
        question_text: 'Question 2?',
        questionType: 'multiple',
        quiz_options: []
      })

      const result = await service.takeQuiz('user-1', '100')

      expect(mockRedis.set).toHaveBeenCalled()

      expect(result).toMatchObject({
        type: 'question'
      })
    })

    it('should return summary when quiz completed', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getOrCreateQuizSession.mockResolvedValue({
        quizSession: {
          id: 1n,
          questionOrder: [10n, 11n],
          answeredCount: 2,
          rightQuestions: 2,
          totalQuestions: 2,
          skillEstimate: 'advanced'
        },
        isNew: false
      })

      mockRedis.get.mockResolvedValue({
        sessionId: '1',
        questionStates: [
          {
            questionId: '10',
            selectedOptionId: '1',
            isCorrect: true
          },
          {
            questionId: '11',
            selectedOptionId: '2',
            isCorrect: true
          }
        ],
        currentIndex: 2,
        score: 2,
        recentResults: [true, true]
      })

      const result = await service.takeQuiz('user-1', '100')

      expect(result).toMatchObject({
        type: 'summary',
        accuracy: 100,
        correct: 2,
        total: 2
      })
    })
  })

  // =========================================================
  // SUBMIT ANSWER
  // =========================================================

  describe('submitAnswer', () => {
    it('should throw ForbiddenException when user has no access', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue(null)

      await expect(service.submitAnswer('user-1', '100', '10', '1')).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException when question not found', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue(null)

      await expect(service.submitAnswer('user-1', '100', '10', '1')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when option not found', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 10n,
        quiz_options: []
      })

      await expect(service.submitAnswer('user-1', '100', '10', '1')).rejects.toThrow(NotFoundException)
    })

    it('should return feedback_with_next', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuestionWithOptions
        .mockResolvedValueOnce({
          id: 10n,
          question_text: 'Question 1?',
          questionType: 'multiple',
          quiz_options: [
            {
              id: 1n,
              option_text: 'A',
              is_correct: true,
              description: 'Correct',
              reason: 'Right'
            },
            {
              id: 2n,
              option_text: 'B',
              is_correct: false,
              description: 'Wrong',
              reason: 'Wrong'
            }
          ]
        })
        .mockResolvedValueOnce({
          id: 11n,
          question_text: 'Question 2?',
          questionType: 'multiple',
          quiz_options: []
        })

      mockQuizRepository.getActiveSessionId.mockResolvedValue('1')

      mockRedis.get.mockResolvedValue({
        sessionId: '1',
        questionStates: [
          {
            questionId: '10',
            selectedOptionId: null,
            isCorrect: null
          },
          {
            questionId: '11',
            selectedOptionId: null,
            isCorrect: null
          }
        ],
        currentIndex: 0,
        score: 0,
        recentResults: []
      })

      const result = await service.submitAnswer('user-1', '100', '10', '1')

      expect(result).toMatchObject({
        type: 'feedback_with_next',
        feedback: {
          isCorrect: true,
          correctOptionId: '1'
        },
        progress: {
          current: 2,
          total: 2
        }
      })

      expect(mockQuizRepository.persistSessionProgress).toHaveBeenCalled()
      expect(mockRedis.set).toHaveBeenCalled()
    })

    it('should return feedback_final when quiz completed', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 11n,
        question_text: 'Question 2?',
        questionType: 'multiple',
        quiz_options: [
          {
            id: 3n,
            option_text: 'C',
            is_correct: true,
            description: 'Correct',
            reason: 'Answer'
          }
        ]
      })

      mockQuizRepository.getActiveSessionId.mockResolvedValue('1')

      mockRedis.get.mockResolvedValue({
        sessionId: '1',
        questionStates: [
          {
            questionId: '10',
            selectedOptionId: '1',
            isCorrect: true
          },
          {
            questionId: '11',
            selectedOptionId: null,
            isCorrect: null
          }
        ],
        currentIndex: 1,
        score: 1,
        recentResults: [true]
      })

      const result = await service.submitAnswer('user-1', '100', '11', '3')

      expect(result).toMatchObject({
        type: 'feedback_final',
        feedback: {
          isCorrect: true
        },
        summary: {
          type: 'summary',
          accuracy: 100
        }
      })

      expect(mockQuizRepository.finishSession).toHaveBeenCalledWith('1')
    })

    it('should return feedback_only when cache missing', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuestionWithOptions.mockResolvedValue({
        id: 10n,
        question_text: 'Question?',
        questionType: 'multiple',
        quiz_options: [
          {
            id: 1n,
            option_text: 'A',
            is_correct: true,
            description: 'Correct',
            reason: 'Answer'
          }
        ]
      })

      mockQuizRepository.getActiveSessionId.mockResolvedValue(null)

      const result = await service.submitAnswer('user-1', '100', '10', '1')

      expect(result).toMatchObject({
        type: 'feedback_only',
        feedback: {
          isCorrect: true
        }
      })

      expect(mockQuizRepository.persistSessionProgress).toHaveBeenCalled()
    })
  })

  // =========================================================
  // QUIZ OVERVIEW
  // =========================================================

  describe('getQuizOverview', () => {
    it('should throw ForbiddenException when user has no access', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue(null)

      await expect(service.getQuizOverview('user-1', '100')).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException when quiz not found', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuizMeta.mockResolvedValue(null)
      mockQuizRepository.getQuizHistory.mockResolvedValue([])

      await expect(service.getQuizOverview('user-1', '100')).rejects.toThrow(NotFoundException)
    })

    it('should return quiz overview', async () => {
      mockQuizRepository.checkUserAccessToQuiz.mockResolvedValue({
        id: 1n
      })

      mockQuizRepository.getQuizMeta.mockResolvedValue({
        id: 100n,
        title: 'Quiz 1'
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
          id: '100'
        },
        history: [
          expect.objectContaining({
            sessionId: '1',
            completed: true,
            score: '8/10'
          })
        ]
      })
    })
  })
})
