/**
 * @lucid/observability — Attribute Helpers
 *
 * Runtime enforcement of the span attribute allowlist.
 * Prevents future engineers from accidentally leaking PII.
 */

import { ALLOWED_ATTRIBUTE_KEYS } from './conventions.js'
import type { Span } from '@opentelemetry/api'

type AttributeValue = string | number | boolean

/**
 * Check if an attribute key is in the global allowlist.
 */
export function isAllowedAttribute(key: string): boolean {
  return ALLOWED_ATTRIBUTE_KEYS.has(key)
}

/**
 * Filter a record of attributes to only allowed keys.
 * Blocked keys are logged as warnings (not silently dropped).
 *
 * Usage:
 * ```ts
 * span.setAttributes(filterAttributes({ 'lucid.run_id': '...', 'secret': '...' }))
 * // → only 'lucid.run_id' passes through; 'secret' is warned + dropped
 * ```
 */
export function filterAttributes(
  attrs: Record<string, AttributeValue>
): Record<string, AttributeValue> {
  const filtered: Record<string, AttributeValue> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (ALLOWED_ATTRIBUTE_KEYS.has(key)) {
      filtered[key] = value
    } else {
      console.warn(`[otel] Blocked non-allowlisted span attribute: ${key}`)
    }
  }
  return filtered
}

/**
 * Safe span attribute setter that enforces the allowlist.
 * Wraps `span.setAttribute()` with allowlist check.
 *
 * Usage:
 * ```ts
 * safeSetAttribute(span, ATTR_KEYS.RUN_ID, runId)      // ✅ allowed
 * safeSetAttribute(span, 'user.email', email)            // ⛔ blocked + warned
 * ```
 */
export function safeSetAttribute(
  span: Span,
  key: string,
  value: AttributeValue
): void {
  if (ALLOWED_ATTRIBUTE_KEYS.has(key)) {
    span.setAttribute(key, value)
  } else {
    console.warn(`[otel] Blocked non-allowlisted span attribute: ${key}`)
  }
}

/**
 * Set multiple attributes on a span, enforcing the allowlist.
 *
 * Usage:
 * ```ts
 * safeSetAttributes(span, {
 *   [ATTR_KEYS.RUN_ID]: runId,
 *   [ATTR_KEYS.CHANNEL_TYPE]: 'whatsapp',
 * })
 * ```
 */
export function safeSetAttributes(
  span: Span,
  attrs: Record<string, AttributeValue>
): void {
  span.setAttributes(filterAttributes(attrs))
}