/**
 * ConfidenceRouter — Phase 5N barrel.
 *
 * Re-exports the public surface the rest of the worker imports.
 * Internal helpers (scoring-table, signals) stay module-private.
 */

export { ConfidenceRouter, confidenceRouter } from './router.js'
export { ROUTER_VERSION } from './version.js'
export type {
  ConfidenceDecision,
  RouteClass,
  RouterInput,
  RouterNode,
  RouterNote,
  RouterParentResult,
  StepType,
} from './types.js'
