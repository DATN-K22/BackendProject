// quiz.repository.ts
//
// Design principles applied here:
//  - Every query uses explicit `select` — no implicit over-fetching.
//  - `getQuestionWithFeedback` is the single query for both question display
//    AND answer feedback. This avoids two separate round-trips (getQuestion + getCorrectOption).
//  - `updateMany` over findFirst+update for session score (1 DB round-trip).
//  - Access check uses a minimal join — only selects `id`, no eager loading.

import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
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

  async getQuizHistory(userId: string, chapterItemId: string, limit?: number, offset?: number) {
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
