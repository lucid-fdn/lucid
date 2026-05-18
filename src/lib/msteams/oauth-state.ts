import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const STATE_TTL_SECONDS = 10 * 60

export interface TeamsOAuthStatePayload {
  nonce: string
  assistantId: string
  orgId: string
  userId: string
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
  const key = secret ?? process.env.MSTEAMS_HOSTED_STATE_SECRET
  if (!key || key.length < 32) {
    throw new Error('MSTEAMS_HOSTED_STATE_SECRET is missing or too short (min 32 chars).')
  }
  return Buffer.from(key, 'utf8')
}

function sign(payloadB64: string, secret: Buffer): string {
  return b64urlEncode(createHmac('sha256', secret).update(payloadB64).digest())
}

export function issueTeamsOAuthState(input: {
  assistantId: string
  orgId: string
  userId: string
  secret?: string
  now?: number
}): string {
  const now = input.now ?? Date.now()
  const wire: WirePayload = {
    n: b64urlEncode(randomBytes(16)),
    a: input.assistantId,
    o: input.orgId,
    u: input.userId,
    e: Math.floor(now / 1000) + STATE_TTL_SECONDS,
  }
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(wire), 'utf8'))
  const sig = sign(payloadB64, getSecret(input.secret))
  return `${payloadB64}.${sig}`
}

export function verifyTeamsOAuthState(
  token: string,
  options: { secret?: string; now?: number } = {},
): TeamsOAuthStatePayload | null {
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

  const expectedSig = Buffer.from(sign(payloadB64, secret), 'utf8')
  const actualSig = Buffer.from(sigB64, 'utf8')
  if (expectedSig.length !== actualSig.length) return null
  if (!timingSafeEqual(expectedSig, actualSig)) return null

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
