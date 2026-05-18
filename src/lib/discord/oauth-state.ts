/**
 * Discord OAuth install — state token helpers.
 *
 * The `/oauth/install` endpoint redirects the user to Discord with a
 * `state` query param. Discord echoes it back on the callback. We use
 * `state` for two things:
 *
 *   1. **CSRF/login binding** — the same Lucid session that initiated
 *      the install must be the one that completes it. A stolen callback
 *      URL pasted into another browser tab must not bind the target
 *      user's Discord guild to somebody else's agent.
 *   2. **Payload carrier** — which assistant is being installed, and
 *      for which org. Putting this in the query string lets the callback
 *      be a pure function of `(code, state)` without server-side state.
 *
 * Format: `<base64url(payloadJson)>.<base64url(hmac)>`
 *
 *   payloadJson = {
 *     n: <128-bit nonce, base64url>,
 *     a: <assistantId UUID>,
 *     o: <orgId UUID>,
 *     u: <userId UUID — session binding>,
 *     e: <unix seconds — expiry>,
 *   }
 *
 *   hmac = HMAC-SHA256(DISCORD_HOSTED_STATE_SECRET, payloadJson)
 *
 * Expiry is short (10 minutes) — Discord's install flow is interactive
 * and completes in seconds. Anything older than that is almost certainly
 * a replay.
 *
 * Constant-time verification via `crypto.timingSafeEqual`. Any parse or
 * signature failure returns null — we never leak why verification failed.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** 10 minutes. Discord install is interactive — short window is safe. */
const STATE_TTL_SECONDS = 10 * 60

export interface DiscordOAuthStatePayload {
  /** Random nonce — prevents state reuse across concurrent installs. */
  nonce: string
  /** Assistant being bound. */
  assistantId: string
  /** Org owning the assistant — double-checked server-side on callback. */
  orgId: string
  /** Lucid user who initiated the install — must match session on callback. */
  userId: string
  /** Expiry in unix seconds. */
  expiresAt: number
}

interface WirePayload {
  n: string
  a: string
  o: string
  u: string
  e: number
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) return null
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
  } catch {
    return null
  }
}

function getSecret(secret?: string): Buffer {
  const key = secret ?? process.env.DISCORD_HOSTED_STATE_SECRET
  if (!key || key.length < 32) {
    throw new Error(
      'DISCORD_HOSTED_STATE_SECRET is missing or too short (min 32 chars). Generate with `openssl rand -hex 32`.',
    )
  }
  return Buffer.from(key, 'utf8')
}

function sign(payloadB64: string, secret: Buffer): string {
  return b64urlEncode(createHmac('sha256', secret).update(payloadB64).digest())
}

/**
 * Issue a fresh state token for a pending Discord install. Caller must
 * pass the Lucid session user id and the assistant being bound — those
 * are rechecked on the callback.
 */
export function issueDiscordOAuthState(input: {
  assistantId: string
  orgId: string
  userId: string
  /** Override for tests — normally read from env. */
  secret?: string
  /** Override for tests — normally `Date.now()`. */
  now?: number
}): string {
  const now = input.now ?? Date.now()
  const nonce = b64urlEncode(randomBytes(16))
  const wire: WirePayload = {
    n: nonce,
    a: input.assistantId,
    o: input.orgId,
    u: input.userId,
    e: Math.floor(now / 1000) + STATE_TTL_SECONDS,
  }
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(wire), 'utf8'))
  const sig = sign(payloadB64, getSecret(input.secret))
  return `${payloadB64}.${sig}`
}

/**
 * Verify a returned state token. Returns the decoded payload on success,
 * null on any failure (bad format, bad signature, expired).
 *
 * Does NOT check that the Lucid session user matches — the caller must
 * compare `payload.userId` against `getServerSession()` to complete the
 * CSRF defense. Returning the payload here means the signature is good;
 * session binding is a separate concern.
 */
export function verifyDiscordOAuthState(
  token: string,
  options: { secret?: string; now?: number } = {},
): DiscordOAuthStatePayload | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null

  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null

  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)

  let secret: Buffer
  try {
    secret = getSecret(options.secret)
  } catch {
    return null
  }

  const expectedSig = sign(payloadB64, secret)
  const expectedBuf = Buffer.from(expectedSig, 'utf8')
  const actualBuf = Buffer.from(sigB64, 'utf8')
  if (expectedBuf.length !== actualBuf.length) return null
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null

  const payloadBytes = b64urlDecode(payloadB64)
  if (!payloadBytes) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(payloadBytes.toString('utf8'))
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const wire = parsed as Partial<WirePayload>
  if (
    typeof wire.n !== 'string' ||
    typeof wire.a !== 'string' ||
    typeof wire.o !== 'string' ||
    typeof wire.u !== 'string' ||
    typeof wire.e !== 'number' ||
    !Number.isFinite(wire.e)
  ) {
    return null
  }

  const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
  if (wire.e < nowSec) return null

  return {
    nonce: wire.n,
    assistantId: wire.a,
    orgId: wire.o,
    userId: wire.u,
    expiresAt: wire.e,
  }
}
