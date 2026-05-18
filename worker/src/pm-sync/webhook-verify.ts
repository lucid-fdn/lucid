/**
 * Webhook Signature Verification — Worker-side copy.
 *
 * Mirror of `src/lib/pm-sync/webhook-verify.ts` minus the `server-only`
 * import (worker has no such restriction). Kept separate because the
 * worker build cannot reach into src/.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'crypto'

/** HMAC-SHA256 hex digest of `body` using `secret`. */
export function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

/** HMAC-SHA256 base64 digest (used by Asana X-Hook-Signature). */
export function hmacSha256Base64(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

/** HMAC-SHA1 base64 digest (used by Trello signature header). */
export function hmacSha1Base64(secret: string, body: string): string {
  return createHmac('sha1', secret).update(body, 'utf8').digest('base64')
}

/**
 * Constant-time string equality check. Returns false when the lengths
 * differ so callers don't need to length-check first. Never throws.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return nodeTimingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/**
 * Parse a signature header that uses the `name=value[,name=value]` format.
 * Returns the trimmed value for the requested key, or the whole header
 * if no `=` is present (plain signature).
 */
export function parseSigHeader(
  header: string | undefined | null,
  key?: string,
): string | null {
  if (!header) return null
  const trimmed = header.trim()
  if (!trimmed.includes('=')) return trimmed
  const parts = trimmed.split(',').map((p) => p.trim())
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (!key || k === key) return v
  }
  return null
}
