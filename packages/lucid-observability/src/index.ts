/**
 * @lucid/observability — Shared Observability Package
 *
 * Single source of truth for:
 *  - Service names, span names, attribute keys (conventions)
 *  - Identity hashing for telemetry (hashForTelemetry)
 *  - Error sanitization (sanitizeErrorForTelemetry, classifyError)
 *  - Attribute allowlist enforcement (filterAttributes, safeSetAttribute)
 *  - Trace propagation (injectTraceContext, extractTraceContext)
 *  - Log correlation (getCorrelationFields)
 *  - Sentry cross-linking (enrichSentryEvent, applySentryPiiScrubbing)
 *
 * Usage:
 * ```ts
 * import {
 *   SERVICE_NAMES, SPAN_NAMES, ATTR_KEYS,
 *   hashForTelemetry, sanitizeErrorForTelemetry,
 *   filterAttributes, injectTraceContext,
 * } from '@lucid/observability'
 * ```
 *
 * Architecture decision:
 *   - OTel SDK initialization is PER-SERVICE (not here)
 *   - This package provides CONVENTIONS + UTILITIES only
 *   - Each service imports what it needs
 */

// ── Conventions ──
export {
  SERVICE_NAMES,
  ENVIRONMENTS,
  getLucidEnv,
  RESOURCE_ATTRS,
  SERVICE_NAMESPACE,
  SPAN_NAMES,
  ATTR_KEYS,
  ALLOWED_ATTRIBUTE_KEYS,
  LOG_FIELDS,
  SAMPLING_DEFAULTS,
  type ServiceName,
  type Environment,
  type SpanName,
  type AttrKey,
} from './conventions.js'

// ── Hashing ──
export { hashForTelemetry, configureHashSalt } from './hash.js'

// ── Error Sanitization ──
export { sanitizeErrorForTelemetry, classifyError } from './sanitize.js'

// ── Attribute Helpers ──
export {
  isAllowedAttribute,
  filterAttributes,
  safeSetAttribute,
  safeSetAttributes,
} from './attributes.js'

// ── Trace Propagation ──
export {
  injectTraceContext,
  injectTraceContextForTarget,
  shouldPropagateTraceContext,
  extractTraceContext,
  getActiveTraceId,
  getActiveSpanId,
  getCorrelationFields,
  type TraceHop,
  type InjectTraceContextOptions,
  type TracePropagationPolicy,
} from './propagation.js'

// ── Sentry (re-exported from subpath too) ──
export {
  SENTRY_PROJECTS,
  buildSentryOtelContext,
  buildSentryTags,
  enrichSentryEvent,
  applySentryPiiScrubbing,
} from './sentry.js'