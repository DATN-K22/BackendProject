import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SkillLevel } from './dto/skill-level.constant'
import { QuestionType } from '@prisma/client'
import { CreateOptionStandaloneDto, CreateQuestionDto, UpdateOptionDto, UpdateQuestionDto } from './dto/quiz.dto'

@Injectable()
export class QuizRepository {
  private readonly logger = new Logger(QuizRepository.name)

  constructor(private readonly prismaService: PrismaService) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private shuffleArray<T>(items: T[]): T[] {
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private toBigInt(id: string): bigint {
    return BigInt(id)
  }

  private async getQuizIdFromChapterItemId(chapterItemId: string): Promise<bigint> {
    const chapterItem = await this.prismaService.chapterItem.findFirst({
      where: {
        id: this.toBigInt(chapterItemId),
        item_type: 'quiz',
        quiz_id: { not: null }
      },
      select: { quiz_id: true }
    })

    if (!chapterItem?.quiz_id) {
      throw new BadRequestException('Chapter item is not a quiz')
    }

    return chapterItem.quiz_id
  }

  // ─── Question: Get all for a quiz ─────────────────────────────────────────

  async getQuestions(chapterItemId: bigint) {
    const chapterItem = await this.prismaService.chapterItem.findUnique({
      where: { id: chapterItemId },
      select: { quiz_id: true }
    })

    if (!chapterItem || !chapterItem.quiz_id) {
      throw new NotFoundException(`Quiz not found for chapterItem ${chapterItemId}`)
    }

    return this.prismaService.quizQuestion.findMany({
      where: { quiz_id: chapterItem.quiz_id },
      include: { quiz_options: true },
      orderBy: { id: 'asc' }
    })
  }

  // ─── Question: Create ─────────────────────────────────────────────────────

  async createQuestion(chapterItemId: bigint, dto: CreateQuestionDto) {
    // 1. Resolve quiz_id từ chapterItem
    const chapterItem = await this.prismaService.chapterItem.findUnique({
      where: { id: chapterItemId },
      select: {
        id: true,
        item_type: true,
        quiz_id: true
      }
    })

    if (!chapterItem) {
      throw new NotFoundException(`ChapterItem ${chapterItemId} not found`)
    }

    if (chapterItem.item_type !== 'quiz') {
      throw new BadRequestException(`ChapterItem ${chapterItemId} is not a quiz`)
    }

    if (!chapterItem.quiz_id) {
      throw new NotFoundException(`Quiz not found for chapterItem ${chapterItemId}`)
    }

    const quizId = chapterItem.quiz_id

    // 2. Validate options
    if (dto.options && dto.questionType !== QuestionType.FILL_BLANK) {
      this._validateOptions(dto.questionType, dto.options)
    }

    // 3. Transaction create
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const question = await tx.quizQuestion.create({
          data: {
            quiz_id: quizId,
            question_text: dto.question_text,
            questionType: dto.questionType,
            quiz_options:
              dto.options && dto.questionType !== QuestionType.FILL_BLANK
                ? {
                    create: dto.options.map((o) => ({
                      option_text: o.option_text,
                      is_correct: o.is_correct,
                      description: o.description ?? '',
                      reason: o.reason ?? ''
                    }))
                  }
                : undefined
          },
          include: { quiz_options: true }
        })

        return question
      })
    } catch (err) {
      this.logger.error('createQuestion failed', err)
      throw new InternalServerErrorException('Failed to create question')
    }
  }

  // ─── Question: Update ─────────────────────────────────────────────────────

  async updateQuestion(questionId: bigint, dto: UpdateQuestionDto) {
    const existing = await this.prismaService.quizQuestion.findUnique({
      where: { id: questionId },
      include: { quiz_options: true }
    })
    if (!existing) throw new NotFoundException(`Question ${questionId} not found`)

    // If changing type FROM choice TO FILL_BLANK, warn / clear options
    const newType = dto.questionType ?? existing.questionType

    try {
      return await this.prismaService.$transaction(async (tx) => {
        // If switching to FILL_BLANK, delete all options
        if (newType === QuestionType.FILL_BLANK && existing.questionType !== QuestionType.FILL_BLANK) {
          await tx.quizOption.deleteMany({ where: { quiz_question_id: questionId } })
        }

        return tx.quizQuestion.update({
          where: { id: questionId },
          data: {
            question_text: dto.question_text,
            questionType: dto.questionType
          },
          include: { quiz_options: true }
        })
      })
    } catch (err) {
      this.logger.error('updateQuestion failed', err)
      throw new InternalServerErrorException('Failed to update question')
    }
  }

  // ─── Question: Delete ─────────────────────────────────────────────────────

  async deleteQuestion(questionId: bigint) {
    const existing = await this.prismaService.quizQuestion.findUnique({
      where: { id: questionId }
    })
    if (!existing) throw new NotFoundException(`Question ${questionId} not found`)

    // Cascade delete: options are deleted via DB cascade (onDelete: Cascade in schema)
    await this.prismaService.quizQuestion.delete({ where: { id: questionId } })
    return { deleted: true, questionId }
  }

  // ─── Option: Add ──────────────────────────────────────────────────────────

  async addOption(questionId: bigint, dto: CreateOptionStandaloneDto) {
    const question = await this.prismaService.quizQuestion.findUnique({
      where: { id: questionId },
      include: { quiz_options: true }
    })
    if (!question) throw new NotFoundException(`Question ${questionId} not found`)
    if (question.questionType === QuestionType.FILL_BLANK) {
      throw new BadRequestException('FILL_BLANK questions cannot have options')
    }

    // For SINGLE_CHOICE: ensure adding a "correct" option doesn't violate constraint
    if (dto.is_correct && question.questionType === QuestionType.SINGLE_CHOICE) {
      const existingCorrect = question.quiz_options.filter((o) => o.is_correct)
      if (existingCorrect.length >= 1) {
        throw new BadRequestException('SINGLE_CHOICE questions can only have 1 correct answer')
      }
    }

    return this.prismaService.quizOption.create({
      data: {
        quiz_question_id: questionId,
        option_text: dto.option_text,
        is_correct: dto.is_correct,
        description: dto.description ?? '',
        reason: dto.reason ?? ''
      }
    })
  }

  // ─── Option: Update ───────────────────────────────────────────────────────

  async updateOption(optionId: bigint, dto: UpdateOptionDto) {
    const option = await this.prismaService.quizOption.findUnique({
      where: { id: optionId },
      include: { quizQuestion: { include: { quiz_options: true } } }
    })
    if (!option) throw new NotFoundException(`Option ${optionId} not found`)

    const question = option.quizQuestion

    // Validate correct count for SINGLE_CHOICE if toggling is_correct
    if (dto.is_correct === true && question.questionType === QuestionType.SINGLE_CHOICE) {
      const otherCorrect = question.quiz_options.filter((o) => o.is_correct && o.id !== optionId)
      if (otherCorrect.length >= 1) {
        throw new BadRequestException('SINGLE_CHOICE can only have 1 correct answer. Unmark the existing one first.')
      }
    }

    return this.prismaService.quizOption.update({
      where: { id: optionId },
      data: {
        option_text: dto.option_text,
        is_correct: dto.is_correct,
        description: dto.description,
        reason: dto.reason
      }
    })
  }

  // ─── Option: Delete ───────────────────────────────────────────────────────

  async deleteOption(optionId: bigint) {
    const option = await this.prismaService.quizOption.findUnique({
      where: { id: optionId },
      include: { quizQuestion: { include: { quiz_options: true } } }
    })
    if (!option) throw new NotFoundException(`Option ${optionId} not found`)

    const question = option.quizQuestion

    // Prevent removing last correct answer in MULTI_CHOICE
    if (option.is_correct && question.questionType === QuestionType.MULTI_CHOICE) {
      const correctCount = question.quiz_options.filter((o) => o.is_correct).length
      if (correctCount <= 1) {
        throw new BadRequestException('MULTI_CHOICE must retain at least 1 correct answer')
      }
    }

    await this.prismaService.quizOption.delete({ where: { id: optionId } })
    return { deleted: true, optionId }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _validateOptions(type: QuestionType, options: { is_correct: boolean }[]) {
    const correctCount = options.filter((o) => o.is_correct).length

    if (type === QuestionType.SINGLE_CHOICE && correctCount !== 1) {
      throw new BadRequestException('SINGLE_CHOICE must have exactly 1 correct answer')
    }
    if (type === QuestionType.MULTI_CHOICE && correctCount < 1) {
      throw new BadRequestException('MULTI_CHOICE must have at least 1 correct answer')
    }
  }

  // ─── Access ──────────────────────────────────────────────────────────────────

  async checkUserAccessToQuiz(userId: string, chapterItemId: string) {
    const enrollment = await this.prismaService.enrollment.findFirst({
      where: {
        user_id: userId,
        course: {
          chapters: {
            some: {
              chapterItems: {
                some: {
                  id: this.toBigInt(chapterItemId),
                  item_type: 'quiz'
                }
              }
            }
          }
        }
      },
      select: { id: true }
    })

    return enrollment
  }

  // ─── Session ─────────────────────────────────────────────────────────────────

  async getOrCreateQuizSession(userId: string, chapterItemId: string) {
    const quizId = await this.getQuizIdFromChapterItemId(chapterItemId)

    const existing = await this.prismaService.quizSession.findFirst({
      where: { user_id: userId, quiz_id: quizId, finish: false },
      // Select only what the service needs to hydrate the cache
      select: {
        id: true,
        questionOrder: true,
        answeredCount: true,
        totalQuestions: true,
        skillEstimate: true,
        rightQuestions: true
      }
    })

    if (existing) return { quizSession: existing, isNew: false, quizId: quizId.toString() }

    try {
      const questions = await this.prismaService.quizQuestion.findMany({
        where: { quiz_id: quizId },
        select: { id: true }
      })

      if (!questions.length) throw new BadRequestException('Quiz has no questions')

      const questionOrder = this.shuffleArray(questions).map((q) => q.id)

      const newSession = await this.prismaService.quizSession.create({
        data: {
          user_id: userId,
          quiz_id: quizId,
          questionOrder,
          totalQuestions: questions.length // denormalised — avoids recomputing
        },
        select: {
          id: true,
          questionOrder: true,
          answeredCount: true,
          totalQuestions: true,
          skillEstimate: true,
          rightQuestions: true
        }
      })

      return { quizSession: newSession, isNew: true, quizId: quizId.toString() }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      this.logger.error('Failed to create quiz session', error)
      throw new InternalServerErrorException('Failed to create quiz session')
    }
  }

  /**
   * Persist session progress to DB.
   * Called on answer submission so progress survives Redis eviction.
   * Uses updateMany (1 round-trip) and only writes fields that changed.
   */
  async persistSessionProgress(
    userId: string,
    chapterItemId: string,
    patch: {
      isCorrect: boolean
      skillEstimate: SkillLevel
    }
  ): Promise<void> {
    const quizId = await this.getQuizIdFromChapterItemId(chapterItemId)

    const { count } = await this.prismaService.quizSession.updateMany({
      where: { user_id: userId, quiz_id: quizId, finish: false },
      data: {
        rightQuestions: { increment: patch.isCorrect ? 1 : 0 },
        answeredCount: { increment: 1 },
        skillEstimate: patch.skillEstimate
      }
    })

    if (count === 0) {
      this.logger.error(`No active quiz session: userId=${userId}, chapterItemId=${chapterItemId}`)
      throw new BadRequestException('No active quiz session found')
    }
  }

  async getActiveSessionId(userId: string, chapterItemId: string): Promise<string | null> {
    const quizId = await this.getQuizIdFromChapterItemId(chapterItemId)

    const session = await this.prismaService.quizSession.findFirst({
      where: {
        user_id: userId,
        quiz_id: quizId,
        finish: false
      },
      select: { id: true }
    })

    return session ? session.id.toString() : null
  }

  async finishSession(sessionId: string): Promise<void> {
    const session = await this.prismaService.quizSession.update({
      where: { id: this.toBigInt(sessionId) },
      data: { finish: true, ended_at: new Date() },
      select: {
        user_id: true,
        quiz_id: true
      }
    })

    const chapterItem = await this.prismaService.chapterItem.findUnique({
      where: { quiz_id: session.quiz_id },
      select: { id: true }
    })

    if (!chapterItem) {
      return
    }

    await this.prismaService.chapterItemStatus.upsert({
      where: {
        uq_chapter_item_status_user_item: {
          user_id: session.user_id,
          chapter_item_id: chapterItem.id
        }
      },
      create: {
        user_id: session.user_id,
        chapter_item_id: chapterItem.id,
        completed: true,
        updated_at: new Date()
      },
      update: {
        completed: true,
        updated_at: new Date()
      }
    })
  }

  // ─── Quiz & Questions ─────────────────────────────────────────────────────────

  async getQuizMeta(chapterItemId: string) {
    const quizId = await this.getQuizIdFromChapterItemId(chapterItemId)

    return this.prismaService.quiz.findUnique({
      where: { id: quizId },
      select: { id: true } // no time_limit (removed)
    })
  }

  /**
   * Single query for both question display and answer feedback.
   *
   * Returns the question with ALL options (including reasons).
   * The service decides how much to expose to the client:
   *   - Before answer: strip `is_correct` and `reason` from options.
   *   - After answer: return full payload with explanation.
   *
   * This avoids a second DB round-trip when the user submits an answer.
   */
  async getQuestionWithOptions(questionId: bigint) {
    const result = await this.prismaService.quizQuestion.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        question_text: true,
        questionType: true,
        quiz_options: {
          select: {
            id: true,
            option_text: true,
            is_correct: true,
            description: true, // full explanation (shown after answer)
            reason: true // per-option reason (shown after answer)
          }
        }
      }
    })
    Logger.debug(
      `Fetched question ${questionId} with options: ${JSON.stringify(result, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
      )}`,
      'QuizRepository.getQuestionWithOptions'
    )
    return result
  }

  async getQuizHistory(userId: string, chapterItemId: string, limit: number = 10, offset: number = 0) {
    const quizId = await this.getQuizIdFromChapterItemId(chapterItemId)

    return this.prismaService.quizSession.findMany({
      where: { user_id: userId, quiz_id: quizId },
      orderBy: { started_at: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        started_at: true,
        ended_at: true,
        finish: true,
        rightQuestions: true,
        totalQuestions: true,
        skillEstimate: true
      }
    })
  }
}
