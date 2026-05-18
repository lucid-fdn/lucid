/**
 * Mission Control — Agent Health Score Utilities
 *
 * Re-exports from the canonical constants file + fleet percentile helper.
 * The actual score computation happens in the worker cron (health-scores.ts).
 * Frontend only displays pre-computed scores from the DB.
 */

export {
  HEALTH_DIMENSIONS,
  HEALTH_WEIGHTS,
  HEALTH_DIMENSION_LABELS,
  HEALTH_DIMENSION_WEIGHT_PCT,
  HEALTH_SCORE_THRESHOLDS,
  HEALTH_GRADE_BOUNDARIES,
  HEALTH_DIMENSION_ORDER,
  getHealthGrade,
  type HealthDimensionKey,
  type HealthGrade,
} from './health-score-constants'

/** Compute fleet percentile for a given score among all scores */
export function computeFleetPercentile(score: number, allScores: number[]): number {
  if (allScores.length === 0) return 50
  const below = allScores.filter((s) => s < score).length
  return Math.round((below / allScores.length) * 100)
}
