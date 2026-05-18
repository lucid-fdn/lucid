/**
 * scoring-table tests — Phase 5N.
 *
 * Invariants:
 *   1. Every (step_type, route) pair is within [0, 1]
 *   2. Monotonic: fast <= strong <= external for every step_type
 *   3. Unknown step_type / route throws in dev (NODE_ENV !== 'production')
 *   4. Unknown step_type / route falls back to 0.5 in production
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { BASE_SCORES, getBaseScore } from '../scoring-table.js'
import type { RouteClass, StepType } from '../types.js'

const ROUTES: RouteClass[] = ['fast', 'strong', 'external']
const STEP_TYPES: StepType[] = ['inbound', 'outbound', 'scheduled', 'webhook', 'approval']

describe('BASE_SCORES table', () => {
  it('contains every step_type × route pair', () => {
    for (const step of STEP_TYPES) {
      expect(BASE_SCORES[step]).toBeDefined()
      for (const route of ROUTES) {
        expect(typeof BASE_SCORES[step][route]).toBe('number')
      }
    }
  })

  it('keeps every score within [0, 1]', () => {
    for (const step of STEP_TYPES) {
      for (const route of ROUTES) {
        const score = BASE_SCORES[step][route]
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is monotonic: fast <= strong <= external for every step_type', () => {
    for (const step of STEP_TYPES) {
      const { fast, strong, external } = BASE_SCORES[step]
      expect(fast).toBeLessThanOrEqual(strong)
      expect(strong).toBeLessThanOrEqual(external)
    }
  })

  it('pins approval to 1.0 across every route (human-gated short-circuit)', () => {
    for (const route of ROUTES) {
      expect(BASE_SCORES.approval[route]).toBe(1.0)
    }
  })
})

describe('getBaseScore()', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('returns the table value for valid inputs', () => {
    expect(getBaseScore('inbound', 'fast')).toBe(0.7)
    expect(getBaseScore('webhook', 'external')).toBe(0.98)
  })

  it('throws in dev on unknown step_type', () => {
    process.env.NODE_ENV = 'test'
    expect(() => getBaseScore('nonexistent', 'fast')).toThrow(/unknown/)
  })

  it('throws in dev on unknown route', () => {
    process.env.NODE_ENV = 'test'
    expect(() => getBaseScore('inbound', 'nuclear')).toThrow(/unknown/)
  })

  it('returns 0.5 fallback in production on unknown step_type', () => {
    process.env.NODE_ENV = 'production'
    // eslint-disable-next-line no-console
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(getBaseScore('bogus', 'fast')).toBe(0.5)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
