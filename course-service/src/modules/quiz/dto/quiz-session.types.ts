// ─── types/quiz-session.types.ts ─────────────────────────────────────────────
//
// Keeping session state in Redis keeps DB writes minimal.
// The cache is the source of truth for in-progress sessions.
// On finish (or periodic checkpoint), we flush to DB.

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
