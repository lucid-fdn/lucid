/**
 * ConfidenceGate — Phase 5N.
 *
 * Single surface the scheduler calls to score a freshly-promoted leaf.
 * Dispatches behind the `FEATURE_CONFIDENCE_ROUTER` feature flag:
 *
 *   - flag off → static evaluation (Phase 4N-d behavior): `observed`
 *     equals the node's floor (or 1.0 if NULL), `source='static'`. The
 *     scheduler's `>= floor` check always passes.
 *
 *   - flag on → delegates to `ConfidenceRouter.score()`:
 *       * deterministic scoring from base table + signal deltas
 *       * upgrade loop fast → strong → external (external opt-in only)
 *       * returns `{ observed, source: 'router', routerVersion, notes }`
 *       * on `failed=true` the scheduler treats the node as gated-out
 *
 * The gate NEVER throws — the scheduler owns the blast radius of a
 * low-confidence result (mark failed with `reason='confidence_floor'`).
 *
 * This file is the swap point the scheduler binds to. Callers pass an
 * `EvaluateConfidenceInput` that carries enough context for either path
 * (config for the flag check, payload for signals, parentResults for
 * uncertainty compounding, expectedVersion for replay drift detection).
 */

import {
  confidenceRouter,
  ROUTER_VERSION,
  type ConfidenceDecision,
  type RouteClass,
  type RouterInput,
  type RouterNote,
  type StepType,
} from './confidence-router/index.js'
import type { DagConfidenceSource } from './types.js'

export interface ConfidenceEvaluation {
  observed: number
  source: DagConfidenceSource
  /** Present when `source='router'`, null on the static path. */
  routerVersion: string | null
  /** Present when `source='router'` — full per-attempt audit trail, null on static path. */
  notes: RouterNote[] | null
  /** Non-null when the router upgraded off the declared route_class. */
  upgradedTo: RouteClass | null
  /** True when the router exhausted every permitted route and still failed the floor. */
  failed: boolean
  /** Canonical fail reason from the router (e.g. `confidence_floor`). Null on success or static. */
  reason: string | null
}

/**
 * Parent results passed into the gate. Phase 5N only uses
 * `confidence_observed` (the `parentHadLowConfidence` signal), but the
 * type stays a list of opaque records so future signals can reach more
 * fields without a churn wave.
 */
export type ConfidenceParentResults = Array<{
  confidence_observed: number | null
}>

/**
 * The minimal slice of a node the gate can act on. The scheduler's
 * `PromotedNode` projection includes these fields plus payload (fetched
 * alongside in the promotion RPC response).
 */
export interface ConfidenceGateNode {
  step_type: string | null
  route_class: string | null
  confidence_floor: number | null
  payload: unknown
}

export interface EvaluateConfidenceInput {
  node: ConfidenceGateNode
  parentResults?: ConfidenceParentResults
  /** Feature-flag gate. When undefined, treats as "router off". */
  featureRouterEnabled?: boolean
  /** Expected router version (from a replayed row), for drift logging. */
  expectedVersion?: string | null
}

const VALID_STEP_TYPES: ReadonlySet<string> = new Set([
  'inbound',
  'outbound',
  'scheduled',
  'webhook',
  'approval',
])

const VALID_ROUTE_CLASSES: ReadonlySet<string> = new Set(['fast', 'strong', 'external'])

/**
 * Evaluate the confidence a node should carry at the moment it
 * transitions from `pending` → `ready`. Pure and synchronous — the
 * router itself is a pure function of its input, and the static path
 * is a constant. Keeping this sync lets callers (scheduler, replay,
 * tests) treat it as a drop-in for the Phase 4N-d stub.
 */
export function evaluateConfidence(input: EvaluateConfidenceInput): ConfidenceEvaluation {
  const { node, parentResults = [], featureRouterEnabled, expectedVersion } = input

  // Static path — feature flag off, OR the node's step_type / route_class
  // is unknown to the router (defensive fallback so an unexpected row
  // shape never crashes the scheduler).
  if (
    !featureRouterEnabled ||
    !node.step_type ||
    !VALID_STEP_TYPES.has(node.step_type) ||
    (node.route_class != null && !VALID_ROUTE_CLASSES.has(node.route_class))
  ) {
    const floor = node.confidence_floor
    return {
      observed: floor == null ? 1.0 : floor,
      source: 'static',
      routerVersion: null,
      notes: null,
      upgradedTo: null,
      failed: false,
      reason: null,
    }
  }

  // Router path.
  const routerInput: RouterInput = {
    node: {
      step_type: node.step_type as StepType,
      route_class: (node.route_class as RouteClass | null) ?? null,
      confidence_floor: node.confidence_floor,
      payload: node.payload,
    },
    parentResults: parentResults.map((p) => ({
      confidence_observed: p.confidence_observed,
    })),
    expectedVersion: expectedVersion ?? null,
  }

  const decision: ConfidenceDecision = confidenceRouter.score(routerInput)

  return {
    observed: decision.observed,
    source: decision.source,
    routerVersion: decision.routerVersion ?? ROUTER_VERSION,
    notes: decision.notes,
    upgradedTo: decision.upgradedTo,
    failed: decision.failed,
    reason: decision.reason,
  }
}
