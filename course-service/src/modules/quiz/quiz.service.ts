// quiz.service.ts
//
// Learning model contract:
//  1. takeQuiz      → returns current question (options only, no answers)
//  2. submitAnswer  → returns full feedback: isCorrect, correctOptionId,
//                     explanation for correct answer, reason for every option,
//                     skill estimate, progress, and the NEXT question if any.
//  3. getQuizOverview → returns quiz meta + history (no heavy analytics)
//
// The user never sees a timer or a score during the quiz.
// Skill level is shown on completion or as a soft hint ("keep going!"), not as pressure.

import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { QuizRepository } from './quiz.repository'
import { RedisCacheService } from '../redis/redis-cache.service'
import { estimateSkillLevel, SKILL_WINDOW_SIZE, SkillLevel } from './dto/skill-level.constant'
import type { QuizSessionCache, QuestionState } from './dto/quiz-session.types'

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name)

  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly redis: RedisCacheService
  ) {}

  // ─── Private helpers ────────────────────────────────────────────────────────

  private sessionKey(sessionId: string, userId: string, chapterItemId: string): string {
    return `quiz_session:${sessionId}:${userId}:${chapterItemId}`
  }

  private async assertAccess(userId: string, chapterItemId: string): Promise<void> {
    const enrollment = await this.quizRepository.checkUserAccessToQuiz(userId, chapterItemId)
    if (!enrollment) throw new ForbiddenException('You do not have access to this quiz')
  }

  /**
   * Build a clean question payload for the client (no answers leaked).
   * The full question (with is_correct/reason) stays in service memory only.
   */
  private sanitiseQuestion(question: NonNullable<Awaited<ReturnType<QuizRepository['getQuestionWithOptions']>>>) {
    return {
      id: question.id.toString(),
      questionText: question.question_text,
      questionType: question.questionType,
      options: question.quiz_options.map((o) => ({
        id: o.id.toString(),
        optionText: o.option_text
        // is_correct and reason intentionally omitted — shown only after submission
      }))
    }
  }

  /**
   * Build the progress snapshot included in every response.
   * Gives the learner a sense of where they are without exam pressure.
   */
  private buildProgress(cache: QuizSessionCache) {
    const total = cache.questionStates.length
    const answered = cache.currentIndex // index = number answered so far
    return {
      current: answered + 1,
      total,
      percentComplete: Math.round((answered / total) * 100)
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start or resume a quiz.
   * Returns the current unanswered question + progress info.
   * Existing sessions resume from where the user left off (no penalty for breaks).
   */
  async takeQuiz(userId: string, chapterItemId: string) {
    await this.assertAccess(userId, chapterItemId)

    const { quizSession, isNew } = await this.quizRepository.getOrCreateQuizSession(userId, chapterItemId)
    const key = this.sessionKey(quizSession.id.toString(), userId, chapterItemId)

    let cache: QuizSessionCache

    if (isNew) {
      // Build fresh cache from the session's shuffled question order
      cache = {
        sessionId: quizSession.id.toString(),
        questionStates: quizSession.questionOrder.map((qId) => ({
          questionId: qId.toString(),
          selectedOptionId: null,
          isCorrect: null
        })),
        currentIndex: 0,
        score: 0,
        recentResults: []
      }
      await this.redis.set(key, cache)
    } else {
      const cached = await this.redis.get<QuizSessionCache>(key)
      if (!cached) {
        // Cache evicted — reconstruct from DB session
        // This is a safe fallback; skill estimate is lost but progress is preserved
        this.logger.warn(`Cache miss for session ${quizSession.id} — reconstructing`)
        cache = {
          sessionId: quizSession.id.toString(),
          questionStates: quizSession.questionOrder.map((qId) => ({
            questionId: qId.toString(),
            selectedOptionId: null,
            isCorrect: null
          })),
          currentIndex: quizSession.answeredCount, // resume from DB checkpoint
          score: quizSession.rightQuestions,
          recentResults: [] // rolling window lost; skill re-estimated from DB fields
        }
        await this.redis.set(key, cache)
      } else {
        cache = cached
      }
    }

    // All questions answered — quiz is complete
    if (cache.currentIndex >= cache.questionStates.length) {
      return this.buildSummary(cache, quizSession.skillEstimate as SkillLevel)
    }

    const currentQuestionId = BigInt(cache.questionStates[cache.currentIndex].questionId)
    Logger.debug(
      `Loading question ${cache.currentIndex + 1}/${cache.questionStates.length} (ID: ${currentQuestionId}) for session ${cache.sessionId}`,
      'QuizService.takeQuiz'
    )
    const question = await this.quizRepository.getQuestionWithOptions(currentQuestionId)
    // Logger.debug(`questionId: ${currentQuestionId}, question: ${JSON.stringify(question)}`, 'QuizService.takeQuiz')
    if (!question) throw new NotFoundException('Question not found')

    return {
      type: 'question' as const,
      progress: this.buildProgress(cache),
      question: this.sanitiseQuestion(question)
    }
  }

  /**
   * Submit an answer for the current question.
   *
   * Returns:
   *  - isCorrect
   *  - correctOptionId
   *  - Full explanation of the correct answer (description field)
   *  - Per-option reason for every option (why right or wrong)
   *  - Skill estimate (soft, not shown as a grade — shown as encouragement)
   *  - Progress
   *  - Next question (if any) — so the client can render immediately without a second request
   *
   * Design note: returning the next question in the same response saves a round-trip
   * and matches how Pluralsight/Duolingo handle answer submission (show feedback + next question).
   */
  async submitAnswer(userId: string, chapterItemId: string, questionId: string, selectedOptionId: string) {
    await this.assertAccess(userId, chapterItemId)

    // Fetch full question (all options with reasons) — single DB query
    const question = await this.quizRepository.getQuestionWithOptions(BigInt(questionId))
    if (!question) throw new NotFoundException('Question not found')

    const selectedOption = question.quiz_options.find((o) => o.id.toString() === selectedOptionId)
    if (!selectedOption) throw new NotFoundException('Option not found')

    const correctOption = question.quiz_options.find((o) => o.is_correct)
    if (!correctOption) throw new NotFoundException('Question has no correct answer')

    const isCorrect = selectedOption.is_correct

    // Build the feedback payload — full transparency, learning-focused
    const feedback = {
      isCorrect,
      correctOptionId: correctOption.id.toString(),
      explanation: correctOption.description, // detailed explanation of the right answer
      optionReasons: question.quiz_options.map((o) => ({
        optionId: o.id.toString(),
        reason: o.reason // why this option is right or wrong
      }))
    }

    // Update Redis cache (primary update — fast path)
    // We look up the key from active session data in Redis; if evicted, we degrade gracefully
    const activeSessionKey = await this.findActiveSessionKey(userId, chapterItemId)
    let skillEstimate: SkillLevel = 'basic'

    if (activeSessionKey) {
      const cache = await this.redis.get<QuizSessionCache>(activeSessionKey)
      if (cache) {
        // Mark current question as answered in cache
        const state = cache.questionStates[cache.currentIndex]
        if (state && state.questionId === questionId) {
          state.selectedOptionId = selectedOptionId
          state.isCorrect = isCorrect
        }

        // Update rolling window and advance pointer
        cache.recentResults = [...cache.recentResults, isCorrect].slice(-SKILL_WINDOW_SIZE)

        if (isCorrect) cache.score++
        cache.currentIndex++

        skillEstimate = estimateSkillLevel(cache.recentResults)

        // Persist to Redis and DB in parallel (1 Redis write + 1 DB write)
        await Promise.all([
          this.redis.set(activeSessionKey, cache),
          this.quizRepository.persistSessionProgress(userId, chapterItemId, {
            isCorrect,
            skillEstimate
          })
        ])

        const progress = this.buildProgress(cache)
        const isFinished = cache.currentIndex >= cache.questionStates.length

        // If finished, mark session complete in DB
        if (isFinished) {
          await this.quizRepository.finishSession(cache.sessionId)
          return {
            type: 'feedback_final' as const,
            feedback,
            progress,
            summary: this.buildSummary(cache, skillEstimate)
          }
        }

        // Fetch next question and return it with the feedback (single response)
        const nextQuestionId = BigInt(cache.questionStates[cache.currentIndex].questionId)
        const nextQuestion = await this.quizRepository.getQuestionWithOptions(nextQuestionId)

        return {
          type: 'feedback_with_next' as const,
          feedback,
          progress,
          skillEstimate, // soft indicator — frame as "your level" not "your score"
          nextQuestion: nextQuestion ? this.sanitiseQuestion(nextQuestion) : null
        }
      }
    }

    // Fallback: cache evicted — return feedback only, client must call takeQuiz to get next
    this.logger.warn(`Cache miss during submitAnswer: userId=${userId}, chapterItemId=${chapterItemId}`)
    await this.quizRepository.persistSessionProgress(userId, chapterItemId, {
      isCorrect,
      skillEstimate
    })

    return {
      type: 'feedback_only' as const,
      feedback,
      skillEstimate
    }
  }

  /**
   * Returns quiz metadata and lightweight history.
   * No heavy analytics — just enough for the learner to see past attempts.
   */
  async getQuizOverview(userId: string, chapterItemId: string, limit?: number, offset?: number) {
    await this.assertAccess(userId, chapterItemId)

    const [quiz, history] = await Promise.all([
      this.quizRepository.getQuizMeta(chapterItemId),
      this.quizRepository.getQuizHistory(userId, chapterItemId, limit, offset)
    ])

    if (!quiz) throw new NotFoundException('Quiz not found')

    return {
      quiz: {
        id: quiz.id.toString(),
        title: quiz.title,
        description: quiz.description
      },
      history: history.map((h) => ({
        sessionId: h.id.toString(),
        startedAt: h.started_at,
        endedAt: h.ended_at,
        completed: h.finish,
        score: `${h.rightQuestions}/${h.totalQuestions}`,
        skillEstimate: h.skillEstimate
      }))
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Reconstruct the session key from an active DB session.
   * Used when we need the key but don't have it in scope.
   * In a real system this could be stored in a session registry key.
   */
  private async findActiveSessionKey(userId: string, chapterItemId: string): Promise<string | null> {
    const sessionId = await this.quizRepository.getActiveSessionId(userId, chapterItemId)
    if (!sessionId) return null
    return this.sessionKey(sessionId, userId, chapterItemId)
  }

  private buildSummary(cache: QuizSessionCache, skillEstimate: SkillLevel) {
    const total = cache.questionStates.length
    const correct = cache.score
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    // Framing: learning-focused language, not exam-style pass/fail
    const encouragement =
      skillEstimate === 'advanced'
        ? 'Outstanding — you have a strong grasp of this topic.'
        : skillEstimate === 'intermediate'
          ? 'Good progress! Review the questions you missed to solidify your understanding.'
          : 'Great start! Revisit this quiz after reviewing the material.'

    return {
      type: 'summary' as const,
      accuracy,
      correct,
      total,
      skillEstimate,
      encouragement,
      missedQuestions: cache.questionStates.filter((s) => s.isCorrect === false).map((s) => s.questionId)
    }
  }
}
