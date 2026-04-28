// quiz.controller.ts
//
// REST surface is intentionally small and learning-focused:
//
//   POST   /quizzes/:userId/:quizId           — start or resume quiz
//   POST   /quizzes/:userId/:quizId/answer    — submit answer + get feedback + next question
//   GET    /quizzes/:userId/:quizId           — quiz overview + history
//
// No GET for individual answers (feedback comes with submission response).
// No timer endpoint (no timer in the learning model).
// Future: add GET /quizzes/:userId/:quizId/review to revisit missed questions.

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiResponse as SwaggerResponse, ApiTags } from '@nestjs/swagger'
import { QuizService } from './quiz.service'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { SubmitAnswerDto } from './dto/submit-answer.dto'

@ApiTags('Quiz')
@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  /**
   * Start or resume a quiz session.
   * Returns the current question (no answers exposed) and progress.
   * Safe to call multiple times — idempotent for existing sessions.
   */
  @Post(':userId/:quizId')
  @ApiOperation({ summary: 'Start or resume a quiz' })
  @SwaggerResponse({ status: 200, description: 'Current question and progress' })
  @SwaggerResponse({ status: 403, description: 'No access to this quiz' })
  async takeQuiz(@Param('userId') userId: string, @Param('quizId') quizId: string) {
    const result = await this.quizService.takeQuiz(userId, quizId)
    return ApiResponse.OkResponse(result, 'Quiz loaded successfully')
  }

  /**
   * Submit an answer for the current question.
   *
   * Response includes:
   *  - isCorrect
   *  - correctOptionId
   *  - Full explanation (correct answer + per-option reasons)
   *  - Skill estimate
   *  - Progress
   *  - Next question (if not finished) — eliminates a second request
   */
  @Post(':userId/:quizId/answer')
  @ApiOperation({ summary: 'Submit an answer and receive learning feedback' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'quizId', description: 'Quiz ID' })
  @ApiBody({ type: SubmitAnswerDto })
  @SwaggerResponse({ status: 200, description: 'Feedback + next question' })
  @SwaggerResponse({ status: 404, description: 'Question or option not found' })
  async submitAnswer(@Param('userId') userId: string, @Param('quizId') quizId: string, @Body() dto: SubmitAnswerDto) {
    const result = await this.quizService.submitAnswer(userId, quizId, dto.questionId, dto.selectedOptionId)
    return ApiResponse.OkResponse(result, 'Answer submitted')
  }

  /**
   * Quiz overview: metadata + attempt history.
   * Does not expose analytics heavy data — just what a learner needs
   * to decide whether to retry.
   */
  @Get(':userId/:quizId')
  @ApiOperation({ summary: 'Get quiz overview and history' })
  @SwaggerResponse({ status: 200, description: 'Quiz meta and past sessions' })
  async getQuizOverview(
    @Param('userId') userId: string,
    @Param('quizId') quizId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    const result = await this.quizService.getQuizOverview(userId, quizId, limit, offset)
    return ApiResponse.OkResponse(result, 'Quiz overview retrieved')
  }
}
