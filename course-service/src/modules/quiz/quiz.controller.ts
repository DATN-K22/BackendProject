import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiResponse as SwaggerResponse, ApiTags } from '@nestjs/swagger'
import { QuizService } from './quiz.service'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { SubmitAnswerDto } from './dto/submit-answer.dto'
import { CreateOptionStandaloneDto, CreateQuestionDto, UpdateOptionDto, UpdateQuestionDto } from './dto/quiz.dto'

@ApiTags('Quiz')
@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  /**
   * Create new quiz questions for a chapter item.
   * Teacher endpoint, not exposed to learners.
   * Idempotent for the same input — will update existing questions.
   * Returns the created/updated quiz with questions and options.
   */
  @Get(':chapter_item_id/questions')
  @HttpCode(HttpStatus.OK)
  async getQuestions(@Param('chapter_item_id') chapter_item_id: string) {
    return ApiResponse.OkResponse(
      await this.quizService.getQuestions(chapter_item_id),
      'Questions retrieved successfully'
    )
  }

  @Post(':chapter_item_id/questions')
  @HttpCode(HttpStatus.CREATED)
  async createQuestion(@Param('chapter_item_id') chapter_item_id: string, @Body() dto: CreateQuestionDto) {
    return ApiResponse.OkCreateResponse(
      await this.quizService.createQuestion(chapter_item_id, dto),
      'Question created successfully'
    )
  }

  @Patch('questions/:questionId')
  @HttpCode(HttpStatus.OK)
  async updateQuestion(@Param('questionId') questionId: string, @Body() dto: UpdateQuestionDto) {
    return ApiResponse.OkResponse(
      await this.quizService.updateQuestion(questionId, dto),
      'Question updated successfully'
    )
  }

  @Delete('questions/:questionId')
  @HttpCode(HttpStatus.OK)
  async deleteQuestion(@Param('questionId') questionId: string) {
    return ApiResponse.OkResponse(await this.quizService.deleteQuestion(questionId), 'Question deleted successfully')
  }

  // ─── Option Routes ─────────────────────────────────────────────────────────

  @Post('questions/:questionId/options')
  @HttpCode(HttpStatus.CREATED)
  async addOption(@Param('questionId') questionId: string, @Body() dto: CreateOptionStandaloneDto) {
    return ApiResponse.OkCreateResponse(await this.quizService.addOption(questionId, dto), 'Option added successfully')
  }

  @Patch('options/:optionId')
  @HttpCode(HttpStatus.OK)
  async updateOption(@Param('optionId') optionId: string, @Body() dto: UpdateOptionDto) {
    return ApiResponse.OkResponse(await this.quizService.updateOption(optionId, dto), 'Option updated successfully')
  }

  @Delete('options/:optionId')
  @HttpCode(HttpStatus.OK)
  async deleteOption(@Param('optionId') optionId: string) {
    return ApiResponse.OkResponse(await this.quizService.deleteOption(optionId), 'Option deleted successfully')
  }

  /**
   * Start or resume a quiz session.
   * Returns the current question (no answers exposed) and progress.
   * Safe to call multiple times — idempotent for existing sessions.
   */
  @Post(':userId/:chapter_item_id/take')
  @ApiOperation({ summary: 'Start or resume a quiz' })
  @SwaggerResponse({ status: 200, description: 'Current question and progress' })
  @SwaggerResponse({ status: 403, description: 'No access to this quiz' })
  async takeQuiz(@Param('userId') userId: string, @Param('chapter_item_id') chapter_item_id: string) {
    const result = await this.quizService.takeQuiz(userId, chapter_item_id)
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
  @Post(':userId/:chapter_item_id/answer')
  @ApiOperation({ summary: 'Submit an answer and receive learning feedback' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'chapter_item_id', description: 'Quiz ID' })
  @ApiBody({ type: SubmitAnswerDto })
  @SwaggerResponse({ status: 200, description: 'Feedback + next question' })
  @SwaggerResponse({ status: 404, description: 'Question or option not found' })
  async submitAnswer(
    @Param('userId') userId: string,
    @Param('chapter_item_id') chapter_item_id: string,
    @Body() dto: SubmitAnswerDto
  ) {
    const result = await this.quizService.submitAnswer(userId, chapter_item_id, dto.questionId, dto.selectedOptionId)
    return ApiResponse.OkResponse(result, 'Answer submitted')
  }

  /**
   * Quiz overview: metadata + attempt history.
   * Does not expose analytics heavy data — just what a learner needs
   * to decide whether to retry.
   */
  @Get(':userId/:chapter_item_id')
  @ApiOperation({ summary: 'Get quiz overview and history' })
  @SwaggerResponse({ status: 200, description: 'Quiz meta and past sessions' })
  async getQuizOverview(
    @Param('userId') userId: string,
    @Param('chapter_item_id') chapter_item_id: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string
  ) {
    const result = await this.quizService.getQuizOverview(userId, chapter_item_id, +limit, +offset)
    return ApiResponse.OkResponse(result, 'Quiz overview retrieved')
  }
}
