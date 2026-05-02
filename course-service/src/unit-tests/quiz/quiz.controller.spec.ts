import { Test, TestingModule } from '@nestjs/testing'
import { QuizController } from '../../modules/quiz/quiz.controller'
import { QuizService } from '../../modules/quiz/quiz.service'

const mockQuizService = {
  takeQuiz: jest.fn(),
  submitAnswer: jest.fn(),
  getQuizOverview: jest.fn()
}

describe('QuizController', () => {
  let controller: QuizController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuizController],
      providers: [{ provide: QuizService, useValue: mockQuizService }]
    }).compile()

    controller = module.get<QuizController>(QuizController)
    jest.clearAllMocks()
  })

  describe('takeQuiz', () => {
    it('should delegate to service and wrap response', async () => {
      const serviceResult = {
        type: 'question',
        progress: { current: 1, total: 3, percentComplete: 33 },
        question: {
          id: '10',
          questionText: 'Question 1?',
          questionType: 'multiple',
          options: [
            { id: '1', optionText: 'Option A' },
            { id: '2', optionText: 'Option B' }
          ]
        }
      }
      mockQuizService.takeQuiz.mockResolvedValue(serviceResult)

      const result = await controller.takeQuiz('user-1', '100')

      expect(mockQuizService.takeQuiz).toHaveBeenCalledWith('user-1', '100')
      expect(result).toMatchObject({
        success: true,
        code: 2000,
        data: serviceResult
      })
    })

    it('should handle quiz summary response', async () => {
      const summaryResult = {
        type: 'summary',
        accuracy: 100,
        correct: 2,
        total: 2,
        skillEstimate: 'advanced',
        encouragement: 'Outstanding — you have a strong grasp of this topic.',
        missedQuestions: []
      }
      mockQuizService.takeQuiz.mockResolvedValue(summaryResult)

      const result = await controller.takeQuiz('user-1', '100')

      expect(result).toMatchObject({
        success: true,
        data: summaryResult
      })
    })
  })

  describe('submitAnswer', () => {
    it('should delegate to service with dto parameters', async () => {
      const serviceResult = {
        type: 'feedback_with_next',
        feedback: {
          isCorrect: true,
          correctOptionId: '1',
          explanation: 'Correct answer explanation',
          optionReasons: [
            { optionId: '1', reason: 'This is correct' },
            { optionId: '2', reason: 'This is wrong' }
          ]
        },
        progress: { current: 2, total: 3, percentComplete: 66 },
        skillEstimate: 'intermediate',
        nextQuestion: {
          id: '11',
          questionText: 'Question 2?',
          questionType: 'multiple',
          options: [{ id: '3', optionText: 'Option C' }]
        }
      }
      mockQuizService.submitAnswer.mockResolvedValue(serviceResult)

      const result = await controller.submitAnswer('user-1', '100', {
        questionId: '10',
        selectedOptionId: '1'
      })

      expect(mockQuizService.submitAnswer).toHaveBeenCalledWith('user-1', '100', '10', '1')
      expect(result).toMatchObject({
        success: true,
        code: 2000,
        data: serviceResult
      })
    })

    it('should handle feedback_final response', async () => {
      const finalResult = {
        type: 'feedback_final',
        feedback: {
          isCorrect: true,
          correctOptionId: '3',
          explanation: 'This is the correct answer',
          optionReasons: []
        },
        progress: { current: 3, total: 3, percentComplete: 100 },
        summary: {
          type: 'summary',
          accuracy: 100,
          correct: 3,
          total: 3,
          skillEstimate: 'advanced',
          encouragement: 'Outstanding — you have a strong grasp of this topic.',
          missedQuestions: []
        }
      }
      mockQuizService.submitAnswer.mockResolvedValue(finalResult)

      const result = await controller.submitAnswer('user-1', '100', {
        questionId: '12',
        selectedOptionId: '3'
      })

      expect(result).toMatchObject({
        success: true,
        data: finalResult
      })
    })

    it('should handle feedback_only response when cache evicted', async () => {
      const feedbackOnly = {
        type: 'feedback_only',
        feedback: {
          isCorrect: true,
          correctOptionId: '1',
          explanation: 'Explanation',
          optionReasons: []
        },
        skillEstimate: 'intermediate'
      }
      mockQuizService.submitAnswer.mockResolvedValue(feedbackOnly)

      const result = await controller.submitAnswer('user-1', '100', {
        questionId: '10',
        selectedOptionId: '1'
      })

      expect(result).toMatchObject({
        success: true,
        data: feedbackOnly
      })
    })

    it('should handle wrong answer feedback', async () => {
      const wrongAnswer = {
        type: 'feedback_with_next',
        feedback: {
          isCorrect: false,
          correctOptionId: '1',
          explanation: 'The correct answer is...',
          optionReasons: [
            { optionId: '1', reason: 'This is the right answer' },
            { optionId: '2', reason: 'This is incorrect' }
          ]
        },
        progress: { current: 2, total: 3, percentComplete: 66 },
        skillEstimate: 'basic',
        nextQuestion: {
          id: '11',
          questionText: 'Next question?',
          questionType: 'multiple',
          options: [{ id: '3', optionText: 'Option C' }]
        }
      }
      mockQuizService.submitAnswer.mockResolvedValue(wrongAnswer)

      const result = await controller.submitAnswer('user-1', '100', {
        questionId: '10',
        selectedOptionId: '2'
      })

      const data = result.data as any
      expect(data.feedback.isCorrect).toBe(false)
      expect(data.skillEstimate).toBe('basic')
    })
  })

  describe('getQuizOverview', () => {
    it('should delegate to service with query parameters', async () => {
      const overviewResult = {
        quiz: {
          id: '50',
          title: 'Chapter 1 Quiz',
          description: 'Test your knowledge'
        },
        history: [
          {
            sessionId: '1',
            startedAt: new Date(),
            endedAt: new Date(),
            completed: true,
            score: '8/10',
            skillEstimate: 'intermediate'
          },
          {
            sessionId: '2',
            startedAt: new Date(),
            endedAt: new Date(),
            completed: true,
            score: '10/10',
            skillEstimate: 'advanced'
          }
        ]
      }
      mockQuizService.getQuizOverview.mockResolvedValue(overviewResult)

      const result = await controller.getQuizOverview('user-1', '100', 10, 0)

      expect(mockQuizService.getQuizOverview).toHaveBeenCalledWith('user-1', '100', 10, 0)
      expect(result).toMatchObject({
        success: true,
        code: 2000,
        data: overviewResult
      })
    })

    it('should call service with default parameters when limit and offset omitted', async () => {
      const overviewResult = {
        quiz: {
          id: '50',
          title: 'Quiz',
          description: 'Test'
        },
        history: []
      }
      mockQuizService.getQuizOverview.mockResolvedValue(overviewResult)

      await controller.getQuizOverview('user-1', '100')

      expect(mockQuizService.getQuizOverview).toHaveBeenCalledWith('user-1', '100', undefined, undefined)
    })

    it('should return quiz overview with empty history', async () => {
      const emptyHistoryResult = {
        quiz: {
          id: '50',
          title: 'New Quiz',
          description: 'Not attempted yet'
        },
        history: []
      }
      mockQuizService.getQuizOverview.mockResolvedValue(emptyHistoryResult)

      const result = await controller.getQuizOverview('user-1', '100', 10, 0)

      const data = result.data as any
      expect(data.history).toHaveLength(0)
      expect(result).toMatchObject({
        success: true,
        data: emptyHistoryResult
      })
    })

    it('should handle pagination parameters', async () => {
      mockQuizService.getQuizOverview.mockResolvedValue({
        quiz: { id: '50', title: 'Quiz', description: 'Test' },
        history: []
      })

      await controller.getQuizOverview('user-1', '100', 5, 10)

      expect(mockQuizService.getQuizOverview).toHaveBeenCalledWith('user-1', '100', 5, 10)
    })
  })
})
