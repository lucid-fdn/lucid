/**
 * ConfidenceRouter types — Phase 5N.
 *
 * The router is a pure function of `(node, parentResults, ROUTER_VERSION)`.
 * The `RouterNode` shape is intentionally minimal — the router does NOT
 * depend on the full `DagNodeRow` so it can be invoked from places that
 * only hold the scheduler's narrower `PromotedNode` projection.
 */

import type { DagConfidenceSource } from '../types.js'

export type RouteClass = 'fast' | 'strong' | 'external'
export type StepType = 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'

/**
 * The subset of a DAG node the router inspects. The scheduler builds
 * this from the DB row + `payload` fetched at ready-transition time.
 */
export interface RouterNode {
  step_type: StepType
  route_class: RouteClass | null
  confidence_floor: number | null
  payload: unknown
}

/**
 * Parent node result the router considers. Only `confidence_observed`
 * matters in v1 — we use it to compound uncertainty via the
 * `parentHadLowConfidence` signal.
 */
export interface RouterParentResult {
  confidence_observed: number | null
}

export interface RouterInput {
  node: RouterNode
  parentResults: RouterParentResult[]
  /**
   * Optional version stamp the caller expected (e.g. from a replayed
   * node row). When provided and it differs from `ROUTER_VERSION`, the
   * router logs a drift warning and records it in notes.
   */
  expectedVersion?: string | null
}

/**
 * Per-attempt audit record kept in `confidence_router_notes`.
 * One entry per route attempted in the upgrade loop.
 */
export interface RouterNote {
  route: RouteClass
  base: number
  delta: number
  observed: number
  signalHits: string[]
  /** Set on the last note when the caller's expected version drifted. */
  driftFromVersion?: string
}

export interface ConfidenceDecision {
  observed: number
  source: DagConfidenceSource
  routerVersion: string | null
  /** Non-null when the router moved the node off its declared route_class. */
  upgradedTo: RouteClass | null
  /** True when all upgrades were exhausted and the floor still wasn't met. */
  failed: boolean
  /** Canonical fail reason (matches scheduler's `error_message` column). Null on success. */
  reason: string | null
  /** Full per-attempt audit trail. Always populated on router decisions. */
  notes: RouterNote[]
}
