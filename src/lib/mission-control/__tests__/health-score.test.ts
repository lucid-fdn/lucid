import { describe, it, expect } from 'vitest'
import {
  HEALTH_WEIGHTS,
  HEALTH_DIMENSIONS,
  HEALTH_DIMENSION_LABELS,
  HEALTH_DIMENSION_WEIGHT_PCT,
  HEALTH_DIMENSION_ORDER,
  HEALTH_SCORE_THRESHOLDS,
  HEALTH_GRADE_BOUNDARIES,
  getHealthGrade,
} from '../health-score-constants'
import { computeFleetPercentile } from '../health-score'

// ─── Constants consistency ───

describe('HEALTH_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum = Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('has 6 dimensions', () => {
    expect(Object.keys(HEALTH_WEIGHTS)).toHaveLength(6)
  })

  it('all weights are positive', () => {
    for (const w of Object.values(HEALTH_WEIGHTS)) {
      expect(w).toBeGreaterThan(0)
    }
  })
})

describe('HEALTH_DIMENSIONS', () => {
  it('keys match HEALTH_WEIGHTS keys', () => {
    const dimKeys = Object.values(HEALTH_DIMENSIONS).sort()
    const weightKeys = Object.keys(HEALTH_WEIGHTS).sort()
    expect(dimKeys).toEqual(weightKeys)
  })

  it('keys match HEALTH_DIMENSION_LABELS keys', () => {
    const dimKeys = Object.values(HEALTH_DIMENSIONS).sort()
    const labelKeys = Object.keys(HEALTH_DIMENSION_LABELS).sort()
    expect(dimKeys).toEqual(labelKeys)
  })

  it('keys match HEALTH_DIMENSION_WEIGHT_PCT keys', () => {
    const dimKeys = Object.values(HEALTH_DIMENSIONS).sort()
    const pctKeys = Object.keys(HEALTH_DIMENSION_WEIGHT_PCT).sort()
    expect(dimKeys).toEqual(pctKeys)
  })
})

describe('HEALTH_DIMENSION_ORDER', () => {
  it('contains all dimension keys', () => {
    const dimKeys = Object.values(HEALTH_DIMENSIONS).sort()
    expect([...HEALTH_DIMENSION_ORDER].sort()).toEqual(dimKeys)
  })

  it('has no duplicates', () => {
    const unique = new Set(HEALTH_DIMENSION_ORDER)
    expect(unique.size).toBe(HEALTH_DIMENSION_ORDER.length)
  })
})

describe('HEALTH_DIMENSION_WEIGHT_PCT', () => {
  it('matches HEALTH_WEIGHTS (percentage form)', () => {
    for (const [key, pct] of Object.entries(HEALTH_DIMENSION_WEIGHT_PCT)) {
      expect(pct).toBe(HEALTH_WEIGHTS[key as keyof typeof HEALTH_WEIGHTS] * 100)
    }
  })
})

// ─── Thresholds ───

describe('HEALTH_SCORE_THRESHOLDS', () => {
  it('green > yellow > orange', () => {
    expect(HEALTH_SCORE_THRESHOLDS.green).toBeGreaterThan(HEALTH_SCORE_THRESHOLDS.yellow)
    expect(HEALTH_SCORE_THRESHOLDS.yellow).toBeGreaterThan(HEALTH_SCORE_THRESHOLDS.orange)
  })
})

describe('HEALTH_GRADE_BOUNDARIES', () => {
  it('A > B > C > D', () => {
    expect(HEALTH_GRADE_BOUNDARIES.A).toBeGreaterThan(HEALTH_GRADE_BOUNDARIES.B)
    expect(HEALTH_GRADE_BOUNDARIES.B).toBeGreaterThan(HEALTH_GRADE_BOUNDARIES.C)
    expect(HEALTH_GRADE_BOUNDARIES.C).toBeGreaterThan(HEALTH_GRADE_BOUNDARIES.D)
  })
})

// ─── Grade assignment ───

describe('getHealthGrade', () => {
  it('returns A for 90+', () => expect(getHealthGrade(95)).toBe('A'))
  it('returns A for exactly 90', () => expect(getHealthGrade(90)).toBe('A'))
  it('returns B for 75-89', () => expect(getHealthGrade(80)).toBe('B'))
  it('returns C for 60-74', () => expect(getHealthGrade(65)).toBe('C'))
  it('returns D for 40-59', () => expect(getHealthGrade(45)).toBe('D'))
  it('returns F for <40', () => expect(getHealthGrade(20)).toBe('F'))
  it('returns F for 0', () => expect(getHealthGrade(0)).toBe('F'))
  it('returns A for 100', () => expect(getHealthGrade(100)).toBe('A'))
})

// ─── Fleet percentile ───

describe('computeFleetPercentile', () => {
  it('returns 50 for empty array', () => {
    expect(computeFleetPercentile(75, [])).toBe(50)
  })

  it('returns 0 when all scores equal', () => {
    expect(computeFleetPercentile(80, [80, 80, 80])).toBe(0)
  })

  it('computes correct percentile', () => {
    const scores = [20, 40, 60, 80, 100]
    expect(computeFleetPercentile(60, scores)).toBe(40)
    expect(computeFleetPercentile(100, scores)).toBe(80)
    expect(computeFleetPercentile(20, scores)).toBe(0)
  })
})
