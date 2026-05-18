/**
 * ConfidenceRouter — Phase 5N.
 *
 * Deterministic, in-process scoring gate invoked by `evaluateConfidence`
 * at the moment the scheduler flips a DAG leaf from `pending` → `ready`.
 *
 * Pure function of `(node, parentResults, ROUTER_VERSION)`:
 *   - No wall clock, no randomness, no IO.
 *   - Same input twice → byte-identical decision.
 *
 * Upgrade loop (spec §4.3):
 *   1. Walk `['fast', 'strong', 'external']` starting at
 *      `node.route_class ?? 'fast'`.
 *   2. For each route: base score + signal deltas → clamp → observed.
 *   3. First route that meets `confidence_floor` wins.
 *   4. `external` is only reachable when the node's payload opts in via
 *      `allow_external_upgrade === true` (templates decide, never the
 *      router itself).
 *   5. If every permitted route fails the floor → `{ failed: true,
 *      reason: 'confidence_floor' }`.
 */

import { getBaseScore } from './scoring-table.js'
import { applySignals } from './signals.js'
import type {
  ConfidenceDecision,
  RouteClass,
  RouterInput,
  RouterNote,
} from './types.js'
import { ROUTER_VERSION } from './version.js'

const ROUTE_ORDER: RouteClass[] = ['fast', 'strong', 'external']

export class ConfidenceRouter {
  score(input: RouterInput): ConfidenceDecision {
    const node = input.node
    const startRoute = node.route_class ?? 'fast'
    const startIdx = Math.max(0, ROUTE_ORDER.indexOf(startRoute))
    const allowExternal = extractAllowExternal(node.payload)

    const notes: RouterNote[] = []

    for (let i = startIdx; i < ROUTE_ORDER.length; i++) {
      const route = ROUTE_ORDER[i]!

      // External is opt-in only — operators must explicitly flag it
      // in the template payload. Otherwise treat it as exhausted.
      if (route === 'external' && !allowExternal) break

      const base = getBaseScore(node.step_type, route)
      const note: RouterNote = {
        route,
        base,
        delta: 0,
        observed: 0,
        signalHits: [],
      }
      const delta = applySignals(input, route, note)
      const observed = clamp01(base + delta)
      note.delta = delta
      note.observed = observed
      notes.push(note)

      if (node.confidence_floor == null || observed >= node.confidence_floor) {
        tagVersionDrift(notes, input.expectedVersion)
        return {
          observed,
          source: 'router',
          routerVersion: ROUTER_VERSION,
          upgradedTo: route !== startRoute ? route : null,
          failed: false,
          reason: null,
          notes,
        }
      }
    }

    // Every permitted route failed the floor.
    tagVersionDrift(notes, input.expectedVersion)
    const last = notes[notes.length - 1]
    return {
      observed: last ? last.observed : 0,
      source: 'router',
      routerVersion: ROUTER_VERSION,
      upgradedTo: null,
      failed: true,
      reason: 'confidence_floor',
      notes,
    }
  }
}

/**
 * Module-level singleton. The router holds no per-call state, so a
 * single instance is safe across concurrent scheduler calls.
 */
export const confidenceRouter = new ConfidenceRouter()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function extractAllowExternal(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') return false
  return (payload as { allow_external_upgrade?: unknown }).allow_external_upgrade === true
}

/**
 * If the caller passed an expectedVersion and it differs from the
 * router's built-in version, log once and record the drift on the
 * final audit note. The decision itself still uses the current
 * version — this is a warning surface, not an escape hatch.
 */
function tagVersionDrift(notes: RouterNote[], expected: string | null | undefined): void {
  if (!expected || expected === ROUTER_VERSION) return
  // eslint-disable-next-line no-console
  console.warn(
    '[confidence-router] version drift on replay: expected=%s actual=%s',
    expected,
    ROUTER_VERSION,
  )
  const last = notes[notes.length - 1]
  if (last) last.driftFromVersion = expected
}
