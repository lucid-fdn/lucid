/**
 * ConfidenceRouter signals — Phase 5N, v1-2026-04-07.
 *
 * Pure-function feature extractors that inspect a node + its parents
 * and return a bounded delta applied to the base score. Each signal
 * MUST:
 *   1. Be deterministic (no wall-clock, no randomness)
 *   2. Stay inside `[-0.2, +0.1]` so a single signal cannot dominate
 *   3. Return `{ hit: false, delta: 0 }` when it doesn't apply
 *
 * `applySignals` is the single entry point the router uses. It iterates
 * the list, sums deltas, and appends `name` to the caller-provided
 * `signalHits` array for audit.
 */

import type {
  RouteClass,
  RouterInput,
  RouterNote,
} from './types.js'

/** Return shape of a single signal evaluation. */
export interface SignalResult {
  name: string
  delta: number
  hit: boolean
}

type Signal = (input: RouterInput, route: RouteClass) => SignalResult

// ---------------------------------------------------------------------------
// Individual signals
// ---------------------------------------------------------------------------

/** Big payloads hurt fast models more than strong/external. */
export const hasLongInput: Signal = (input, route) => {
  const name = 'hasLongInput'
  if (route !== 'fast') return { name, delta: 0, hit: false }
  const size = safeJsonLength(input.node.payload)
  if (size > 4000) return { name, delta: -0.05, hit: true }
  return { name, delta: 0, hit: false }
}

/** Fast lane is unreliable when the node expects structured tool calls. */
export const requiresToolCalls: Signal = (input, route) => {
  const name = 'requiresToolCalls'
  if (route !== 'fast') return { name, delta: 0, hit: false }
  const p = input.node.payload as { tool_names?: unknown } | null
  if (
    p &&
    typeof p === 'object' &&
    Array.isArray(p.tool_names) &&
    p.tool_names.length > 0
  ) {
    return { name, delta: -0.08, hit: true }
  }
  return { name, delta: 0, hit: false }
}

/** Uncertainty compounds: if any upstream parent was shaky, so are we. */
export const parentHadLowConfidence: Signal = (input) => {
  const name = 'parentHadLowConfidence'
  for (const p of input.parentResults) {
    if (p.confidence_observed != null && p.confidence_observed < 0.7) {
      return { name, delta: -0.1, hit: true }
    }
  }
  return { name, delta: 0, hit: false }
}

/** Strict schemas make structured output easier → small bonus. */
export const payloadHasStrictSchema: Signal = (input) => {
  const name = 'payloadHasStrictSchema'
  const p = input.node.payload as { schema?: unknown } | null
  if (p && typeof p === 'object' && p.schema && typeof p.schema === 'object') {
    return { name, delta: 0.03, hit: true }
  }
  return { name, delta: 0, hit: false }
}

/**
 * Approval steps are human-gated — the signal always "hits" for audit
 * but contributes no delta (the base score already pins them to 1.0).
 */
export const isApprovalStep: Signal = (input) => {
  const name = 'isApprovalStep'
  if (input.node.step_type === 'approval') {
    return { name, delta: 0, hit: true }
  }
  return { name, delta: 0, hit: false }
}

/**
 * Canonical ordered list. Order matters for stable audit traces.
 */
export const SIGNALS: Signal[] = [
  hasLongInput,
  requiresToolCalls,
  parentHadLowConfidence,
  payloadHasStrictSchema,
  isApprovalStep,
]

/**
 * Apply every signal against the input + route. Sums deltas and pushes
 * the names of every signal that fired into `note.signalHits`.
 *
 * Returns the total delta (unclamped — the router clamps the final
 * `base + delta` to `[0, 1]` so individual signal bounds don't need
 * to do it).
 */
export function applySignals(
  input: RouterInput,
  route: RouteClass,
  note: RouterNote,
): number {
  let total = 0
  for (const signal of SIGNALS) {
    const result = signal(input, route)
    if (result.hit) {
      note.signalHits.push(result.name)
      total += result.delta
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonLength(payload: unknown): number {
  if (payload == null) return 0
  try {
    return JSON.stringify(payload).length
  } catch {
    return 0
  }
}
