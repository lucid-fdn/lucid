/**
 * @lucid/observability — Telemetry Hashing
 *
 * Stable salted hash for identity values in span attributes.
 * Ensures tenant/session/user keys are NEVER exposed raw in telemetry.
 *
 * The hash is:
 *  - Deterministic (same input → same output) for correlation
 *  - Salted (not reversible without the salt)
 *  - Truncated to 32 hex chars (128 bits — collision-safe at any scale)
 */

import { createHash } from 'node:crypto'

const DEFAULT_SALT = 'lucid-otel-v1'

let _salt = DEFAULT_SALT
let _configured = false

/**
 * Configure the hash salt. Call once at service startup.
 *
 * ⚠️  In production (LUCID_ENV=production), OTEL_HASH_SALT MUST be explicitly set.
 * Using the default salt in prod risks:
 *  - Cross-environment correlation leaks
 *  - Inability to rotate hashes if needed
 *
 * Best practice: set via OTEL_HASH_SALT env var in all environments.
 *
 * @param salt - The salt value. If empty/undefined, uses default.
 * @param environment - Current LUCID_ENV. If 'production' and no salt, throws.
 */
export function configureHashSalt(salt?: string, environment?: string): void {
  if (!salt && environment === 'production') {
    throw new Error(
      '[otel] OTEL_HASH_SALT must be set in production. ' +
      'Using the default salt in prod risks cross-environment correlation leaks. ' +
      'Set OTEL_HASH_SALT to a unique, secret value for this environment.'
    )
  }
  _salt = salt || DEFAULT_SALT
  _configured = true
}

/**
 * Stable salted hash for telemetry attributes.
 *
 * Usage:
 * ```ts
 * span.setAttribute(ATTR_KEYS.TENANT_KEY_HASH, hashForTelemetry(tenantKey))
 * ```
 *
 * @param value - The raw identity value (tenant key, session key, user key)
 * @returns 32-char hex string (128-bit truncated SHA-256, collision-safe at scale)
 */
export function hashForTelemetry(value: string): string {
  if (!_configured) {
    // Warn once if hashForTelemetry is called before configureHashSalt
    console.warn('[otel] hashForTelemetry called before configureHashSalt(). Using default salt.')
    _configured = true // Only warn once
  }
  return createHash('sha256')
    .update(`${_salt}:${value}`)
    .digest('hex')
    .slice(0, 32)
}