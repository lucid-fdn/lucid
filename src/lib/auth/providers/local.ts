/**
 * Local Auth Provider — GoTrue (Supabase Auth) email/password.
 *
 * Default for self-hosted deployments. Uses GoTrue service
 * running in docker-compose for JWT generation + verification.
 *
 * Flow:
 *   1. User signs up/in via GoTrue (email/password)
 *   2. GoTrue sets JWT cookies (sb-access-token)
 *   3. We verify JWT using JWT_SECRET (HMAC-SHA256, timing-safe)
 *   4. JIT create profile via shared resolveInternalUserId
 */

import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { resolveInternalUserId } from './resolve-user'
import type { AuthProvider, AuthSession } from '../adapter'

type LocalAuthClaims = { sub: string; email?: string; role?: string }

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadB64 = token.split('.')[1]
    if (!payloadB64) return null
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Decode and verify a GoTrue JWT using the shared JWT_SECRET */
function verifyGoTrueJwtLocally(token: string): LocalAuthClaims | null {
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET not configured')

    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, signatureB64] = parts

    // Verify HMAC-SHA256 signature (timing-safe comparison)
    const data = `${headerB64}.${payloadB64}`
    const expectedSig = createHmac('sha256', secret)
      .update(data)
      .digest('base64url')

    const actualSig = signatureB64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const expectedBuf = Buffer.from(expectedSig, 'utf-8')
    const actualBuf = Buffer.from(actualSig, 'utf-8')
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return null
    }

    const payload = decodeJwtPayload(token)
    if (!payload) return null

    // Check expiry
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
    }
  } catch {
    return null
  }
}

function resolveAuthBaseUrl(): string | null {
  const explicit = process.env.GOTRUE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, '').endsWith('/auth/v1')
      ? explicit.replace(/\/+$/, '')
      : `${explicit.replace(/\/+$/, '')}/auth/v1`
  }

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/auth/v1` : null
}

async function verifyGoTrueJwtRemotely(token: string): Promise<LocalAuthClaims | null> {
  const authBaseUrl = resolveAuthBaseUrl()
  const apiKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ''

  if (!authBaseUrl || !apiKey) {
    return null
  }

  try {
    const response = await fetch(`${authBaseUrl}/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) return null

    const data = (await response.json()) as Record<string, unknown>
    const id = typeof data.id === 'string' ? data.id : null
    if (!id) return null

    return {
      sub: id,
      email: typeof data.email === 'string' ? data.email : undefined,
      role: typeof data.role === 'string' ? data.role : undefined,
    }
  } catch {
    return null
  }
}

async function verifyGoTrueJwt(token: string): Promise<LocalAuthClaims | null> {
  const localClaims = verifyGoTrueJwtLocally(token)
  if (localClaims) return localClaims
  return verifyGoTrueJwtRemotely(token)
}

export class LocalAuthProvider implements AuthProvider {
  readonly tokenCookieNames = [
    'sb-access-token',
    'sb-auth-token',
    'lucid-auth-token',
  ]

  async verifyToken(token: string): Promise<AuthSession | null> {
    const claims = await verifyGoTrueJwt(token)
    if (!claims) return null

    const gotrueUserId = claims.sub

    const internalUserId = await resolveInternalUserId({
      provider: 'local',
      externalId: gotrueUserId,
      email: claims.email,
    })

    if (!internalUserId) return null

    return {
      userId: internalUserId,
      externalId: `local:${gotrueUserId}`,
    }
  }

  async getExternalId(token: string): Promise<string | null> {
    const claims = await verifyGoTrueJwt(token)
    if (!claims) return null
    return `local:${claims.sub}`
  }
}
