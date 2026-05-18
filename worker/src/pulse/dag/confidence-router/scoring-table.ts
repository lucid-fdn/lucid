/**
 * ConfidenceRouter scoring table — Phase 5N, v1-2026-04-07.
 *
 * Hand-tuned base scores keyed by `(step_type, route_class)`. Bumping
 * any value in this table requires a `ROUTER_VERSION` bump so replay
 * can detect the drift.
 *
 * Monotonicity invariant (enforced by scoring-table.test.ts):
 *   fast <= strong <= external  for every step_type.
 * This is what makes the router's upgrade loop a valid search — each
 * step along the path can only ever IMPROVE the observed score.
 */

import type { RouteClass, StepType } from './types.js'

export const BASE_SCORES: Record<StepType, Record<RouteClass, number>> = {
  inbound: { fast: 0.7, strong: 0.88, external: 0.95 },
  outbound: { fast: 0.72, strong: 0.9, external: 0.95 },
  scheduled: { fast: 0.75, strong: 0.92, external: 0.97 },
  webhook: { fast: 0.85, strong: 0.95, external: 0.98 },
  // Approvals are human-gated — the router trusts them at 1.0 across
  // every route so the upgrade loop short-circuits on the first attempt.
  approval: { fast: 1.0, strong: 1.0, external: 1.0 },
}

const VALID_STEP_TYPES = new Set<string>(Object.keys(BASE_SCORES))
const VALID_ROUTES = new Set<string>(['fast', 'strong', 'external'])

/**
 * Strict-typed base-score lookup.
 *
 * In dev (`NODE_ENV !== 'production'`), unknown `step_type` or
 * `route_class` throws — router bugs must be loud. In prod, the
 * router logs a warning and returns `0.5` as a neutral fallback so
 * a single bad row never takes the scheduler down.
 */
export function getBaseScore(stepType: string, route: string): number {
  if (VALID_STEP_TYPES.has(stepType) && VALID_ROUTES.has(route)) {
    return BASE_SCORES[stepType as StepType][route as RouteClass]
  }

  const msg = `[confidence-router] unknown (step_type=${stepType}, route=${route})`
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.warn(`${msg} — falling back to 0.5`)
    return 0.5
  }
  throw new Error(msg)
}
