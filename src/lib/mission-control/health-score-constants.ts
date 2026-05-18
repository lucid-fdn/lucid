/**
 * Health Score — Single Source of Truth
 *
 * All health score constants live here. Every file that references
 * health dimensions, weights, thresholds, or colors imports from here.
 *
 * Canonical dimension names match what the worker cron stores in
 * `mc_agent_health_scores.dimension_scores` JSONB.
 */

// ─── Canonical Dimension Names ───
// These keys are stored in the DB and must not be renamed without a migration.

export const HEALTH_DIMENSIONS = {
  latency: 'latency',
  error_rate: 'error_rate',
  memory_health: 'memory_health',
  tool_reliability: 'tool_reliability',
  user_satisfaction: 'user_satisfaction',
  cost_efficiency: 'cost_efficiency',
} as const

export type HealthDimensionKey = (typeof HEALTH_DIMENSIONS)[keyof typeof HEALTH_DIMENSIONS]

// ─── Weights (must sum to 1.0) ───

export const HEALTH_WEIGHTS: Record<HealthDimensionKey, number> = {
  latency: 0.20,
  error_rate: 0.25,
  memory_health: 0.15,
  tool_reliability: 0.15,
  user_satisfaction: 0.15,
  cost_efficiency: 0.10,
}

// ─── Display Labels ───

export const HEALTH_DIMENSION_LABELS: Record<HealthDimensionKey, string> = {
  latency: 'Response Latency',
  error_rate: 'Error Rate',
  memory_health: 'Memory Health',
  tool_reliability: 'Tool Reliability',
  user_satisfaction: 'User Satisfaction',
  cost_efficiency: 'Cost Efficiency',
}

// ─── Display Weights (percentage) ───

export const HEALTH_DIMENSION_WEIGHT_PCT: Record<HealthDimensionKey, number> = {
  latency: 20,
  error_rate: 25,
  memory_health: 15,
  tool_reliability: 15,
  user_satisfaction: 15,
  cost_efficiency: 10,
}

// ─── Score Color Thresholds ───
// Used by HealthScoreBadge and AgentHealthPanel for consistent coloring.

export const HEALTH_SCORE_THRESHOLDS = {
  green: 80,
  yellow: 60,
  orange: 40,
} as const

// ─── Grade Boundaries ───

export const HEALTH_GRADE_BOUNDARIES = {
  A: 90,
  B: 75,
  C: 60,
  D: 40,
} as const

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export function getHealthGrade(score: number): HealthGrade {
  if (score >= HEALTH_GRADE_BOUNDARIES.A) return 'A'
  if (score >= HEALTH_GRADE_BOUNDARIES.B) return 'B'
  if (score >= HEALTH_GRADE_BOUNDARIES.C) return 'C'
  if (score >= HEALTH_GRADE_BOUNDARIES.D) return 'D'
  return 'F'
}

// ─── Dimension order for rendering ───

export const HEALTH_DIMENSION_ORDER: HealthDimensionKey[] = [
  'error_rate',
  'latency',
  'tool_reliability',
  'memory_health',
  'user_satisfaction',
  'cost_efficiency',
]
