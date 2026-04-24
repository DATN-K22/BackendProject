// quiz.repository.ts
//
// Design principles applied here:
//  - Every query uses explicit `select` — no implicit over-fetching.
//  - `getQuestionWithFeedback` is the single query for both question display
//    AND answer feedback. This avoids two separate round-trips (getQuestion + getCorrectOption).
//  - `updateMany` over findFirst+update for session score (1 DB round-trip).
//  - Access check uses a minimal join — only selects `id`, no eager loading.

import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SkillLevel } from './dto/skill-level.constant'

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

  // ─── Access ──────────────────────────────────────────────────────────────────

  async checkUserAccessToQuiz(userId: string, quizId: string): Promise<boolean> {
    const enrollment = await this.prismaService.enrollment.findFirst({
      where: {
        user_id: userId,
        course: {
          chapters: {
            some: {
              quizzes: { some: { id: this.toBigInt(quizId) } }
            }
          }
        }
      },
      select: { id: true }
    })
    return !!enrollment
  }

  // ─── Session ─────────────────────────────────────────────────────────────────

  async getOrCreateQuizSession(userId: string, quizId: string) {
    const existing = await this.prismaService.quizSession.findFirst({
      where: { user_id: userId, quiz_id: this.toBigInt(quizId), finish: false },
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

    if (existing) return { quizSession: existing, isNew: false }

    try {
      const questions = await this.prismaService.quizQuestion.findMany({
        where: { quiz_id: this.toBigInt(quizId) },
        select: { id: true }
      })

      if (!questions.length) throw new BadRequestException('Quiz has no questions')

      const questionOrder = this.shuffleArray(questions).map((q) => q.id)

      const newSession = await this.prismaService.quizSession.create({
        data: {
          user_id: userId,
          quiz_id: this.toBigInt(quizId),
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

      return { quizSession: newSession, isNew: true }
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
    quizId: string,
    patch: {
      isCorrect: boolean
      skillEstimate: SkillLevel
    }
  ): Promise<void> {
    const { count } = await this.prismaService.quizSession.updateMany({
      where: { user_id: userId, quiz_id: this.toBigInt(quizId), finish: false },
      data: {
        rightQuestions: { increment: patch.isCorrect ? 1 : 0 },
        answeredCount: { increment: 1 },
        skillEstimate: patch.skillEstimate
      }
    })

    if (count === 0) {
      this.logger.error(`No active quiz session: userId=${userId}, quizId=${quizId}`)
      throw new BadRequestException('No active quiz session found')
    }
  }

  async finishSession(sessionId: string): Promise<void> {
    await this.prismaService.quizSession.update({
      where: { id: this.toBigInt(sessionId) },
      data: { finish: true, ended_at: new Date() }
    })
  }

  // ─── Quiz & Questions ─────────────────────────────────────────────────────────

  async getQuizMeta(quizId: string) {
    return this.prismaService.quiz.findUnique({
      where: { id: this.toBigInt(quizId) },
      select: { id: true, title: true, description: true } // no time_limit (removed)
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

  async getQuizHistory(userId: string, quizId: string, limit?: number, offset?: number) {
    return this.prismaService.quizSession.findMany({
      where: { user_id: userId, quiz_id: this.toBigInt(quizId) },
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
