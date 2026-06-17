import { Test, TestingModule } from '@nestjs/testing'
import { QuizController } from '../../modules/quiz/quiz.controller'
import { QuizService } from '../../modules/quiz/quiz.service'

const mockQuizService = {
  getQuestions: jest.fn(),
  createQuestion: jest.fn(),
  updateQuestion: jest.fn(),
  deleteQuestion: jest.fn(),
  addOption: jest.fn(),
  updateOption: jest.fn(),
  deleteOption: jest.fn(),
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

  describe('getQuestions', () => {
    it('should return all questions for a chapter item', async () => {
      const questions = [
        {
          id: '1',
          question_text: 'What is TypeScript?',
          questionType: 'multiple',
          quiz_options: [{ id: '1', option_text: 'A language', is_correct: true }]
        }
      ]

      mockQuizService.getQuestions.mockResolvedValue(questions)

      const result = await controller.getQuestions('100')

      expect(mockQuizService.getQuestions).toHaveBeenCalledWith('100')
      expect(result).toMatchObject({
        success: true,
        data: questions
      })
    })
  })

  describe('createQuestion', () => {
    it('should create a new question', async () => {
      const dto = {
        question_text: 'What is NestJS?',
        questionType: 'multiple',
        options: [{ option_text: 'A framework', is_correct: true, description: 'Correct' }]
      }
      const created = { id: '2', ...dto }

      mockQuizService.createQuestion.mockResolvedValue(created)

      const result = await controller.createQuestion('100', dto as any)

      expect(mockQuizService.createQuestion).toHaveBeenCalledWith('100', dto)
      expect(result).toMatchObject({
        success: true,
        data: created
      })
    })
  })

  describe('updateQuestion', () => {
    it('should update an existing question', async () => {
      const dto = { question_text: 'Updated question?' }
      const updated = { id: '1', ...dto }

      mockQuizService.updateQuestion.mockResolvedValue(updated)

      const result = await controller.updateQuestion('1', dto as any)

      expect(mockQuizService.updateQuestion).toHaveBeenCalledWith('1', dto)
      expect(result).toMatchObject({
        success: true,
        data: updated
      })
    })
  })

  describe('deleteQuestion', () => {
    it('should delete a question', async () => {
      mockQuizService.deleteQuestion.mockResolvedValue({ success: true })

      const result = await controller.deleteQuestion('1')

      expect(mockQuizService.deleteQuestion).toHaveBeenCalledWith('1')
      expect(result).toMatchObject({
        success: true,
        data: { success: true }
      })
    })
  })

  describe('addOption', () => {
    it('should add option to a question', async () => {
      const dto = {
        option_text: 'New option',
        is_correct: false,
        description: 'Description',
        reason: 'Reason'
      }
      const added = { id: '10', ...dto }

      mockQuizService.addOption.mockResolvedValue(added)

      const result = await controller.addOption('1', dto as any)

      expect(mockQuizService.addOption).toHaveBeenCalledWith('1', dto)
      expect(result).toMatchObject({
        success: true,
        data: added
      })
    })
  })

  describe('updateOption', () => {
    it('should update an option', async () => {
      const dto = { option_text: 'Updated option' }
      const updated = { id: '10', ...dto }

      mockQuizService.updateOption.mockResolvedValue(updated)

      const result = await controller.updateOption('10', dto as any)

      expect(mockQuizService.updateOption).toHaveBeenCalledWith('10', dto)
      expect(result).toMatchObject({
        success: true,
        data: updated
      })
    })
  })

  describe('deleteOption', () => {
    it('should delete an option', async () => {
      mockQuizService.deleteOption.mockResolvedValue({ success: true })

      const result = await controller.deleteOption('10')

      expect(mockQuizService.deleteOption).toHaveBeenCalledWith('10')
      expect(result).toMatchObject({
        success: true,
        data: { success: true }
      })
    })
  })

  describe('takeQuiz', () => {
    it('should return current question when quiz started', async () => {
      const quizData = {
        type: 'question',
        progress: { current: 1, total: 5, percentComplete: 20 },
        question: {
          id: '1',
          questionText: 'Question 1?',
          questionType: 'multiple',
          options: [{ id: '1', optionText: 'Option A' }]
        }
      }

      mockQuizService.takeQuiz.mockResolvedValue(quizData)

      const result = await controller.takeQuiz('user-1', '100')

      expect(mockQuizService.takeQuiz).toHaveBeenCalledWith('user-1', '100')
      expect(result).toMatchObject({
        success: true,
        data: quizData
      })
    })

    it('should return summary when quiz completed', async () => {
      const summaryData = {
        type: 'summary',
        accuracy: 100,
        correct: 5,
        total: 5,
        skillEstimate: 'advanced'
      }

      mockQuizService.takeQuiz.mockResolvedValue(summaryData)

      const result = await controller.takeQuiz('user-1', '100')

      expect(result.data).toMatchObject(summaryData)
    })
  })

  describe('submitAnswer', () => {
    it('should submit answer and return feedback with next question', async () => {
      const dto = {
        questionId: '1',
        selectedOptionId: '1'
      }
      const feedback = {
        type: 'feedback_with_next',
        feedback: {
          isCorrect: true,
          correctOptionId: '1',
          explanation: 'Correct!'
        },
        progress: { current: 2, total: 5, percentComplete: 40 },
        nextQuestion: { id: '2', questionText: 'Question 2?' }
      }

      mockQuizService.submitAnswer.mockResolvedValue(feedback)

      const result = await controller.submitAnswer('user-1', '100', dto)

      expect(mockQuizService.submitAnswer).toHaveBeenCalledWith('user-1', '100', '1', '1')
      expect(result).toMatchObject({
        success: true,
        data: feedback
      })
    })

    it('should handle incorrect answer', async () => {
      const dto = {
        questionId: '1',
        selectedOptionId: '2'
      }
      const feedback = {
        type: 'feedback_with_next',
        feedback: {
          isCorrect: false,
          correctOptionId: '1'
        },
        nextQuestion: { id: '2' }
      }

      mockQuizService.submitAnswer.mockResolvedValue(feedback)

      const result: any = await controller.submitAnswer('user-1', '100', dto)

      expect(result.data.feedback.isCorrect).toBe(false)
    })
  })

  describe('getQuizOverview', () => {
    it('should return quiz metadata and history', async () => {
      const overview = {
        quizMeta: {
          id: '100',
          title: 'Quiz 1',
          totalQuestions: 5
        },
        history: [{ sessionId: '1', accuracy: 80, completedAt: new Date() }]
      }

      mockQuizService.getQuizOverview.mockResolvedValue(overview)

      const result = await controller.getQuizOverview('user-1', '100', '10', '0')

      expect(mockQuizService.getQuizOverview).toHaveBeenCalledWith('user-1', '100', 10, 0)
      expect(result).toMatchObject({
        success: true,
        data: overview
      })
    })
  })
})
