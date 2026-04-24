// ─── types/quiz-session.types.ts ─────────────────────────────────────────────
//
// Keeping session state in Redis keeps DB writes minimal.
// The cache is the source of truth for in-progress sessions.
// On finish (or periodic checkpoint), we flush to DB.

import { SkillLevel } from './skill-level.constant'

// types/quiz-session.types.ts

export interface QuestionState {
  questionId: string
  selectedOptionId: string | null
  isCorrect: boolean | null
}

export interface QuizSessionCache {
  sessionId: string
  questionStates: QuestionState[]
  currentIndex: number
  score: number
  recentResults: boolean[]
}
// ─── constants/skill-level.constant.ts ───────────────────────────────────────
//
// Skill estimation uses a simple rolling window over recent answers.
// This is intentionally lightweight — not a full IRT model.
// The window prevents early questions from permanently anchoring the estimate.

export const SKILL_WINDOW_SIZE = 10 // look at last N answers
export const SKILL_THRESHOLDS = {
  advanced: 0.8, // ≥80% correct in window → advanced
  intermediate: 0.5 // ≥50% correct → intermediate
  // else → basic
} as const

export function estimateSkillLevel(recentResults: boolean[]): SkillLevel {
  if (recentResults.length === 0) return 'basic'
  const window = recentResults.slice(-SKILL_WINDOW_SIZE)
  const ratio = window.filter(Boolean).length / window.length
  if (ratio >= SKILL_THRESHOLDS.advanced) return 'advanced'
  if (ratio >= SKILL_THRESHOLDS.intermediate) return 'intermediate'
  return 'basic'
}
