// constants/skill-level.constant.ts
export type SkillLevel = 'basic' | 'intermediate' | 'advanced'

export const SKILL_WINDOW_SIZE = 10

export const SKILL_THRESHOLDS = {
  advanced: 0.8,
  intermediate: 0.5
} as const

export function estimateSkillLevel(recentResults: boolean[]): SkillLevel {
  if (recentResults.length === 0) return 'basic'
  const window = recentResults.slice(-SKILL_WINDOW_SIZE)
  const ratio = window.filter(Boolean).length / window.length
  if (ratio >= SKILL_THRESHOLDS.advanced) return 'advanced'
  if (ratio >= SKILL_THRESHOLDS.intermediate) return 'intermediate'
  return 'basic'
}
