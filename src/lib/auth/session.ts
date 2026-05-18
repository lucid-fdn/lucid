/**
 * Server-only Auth Session Management
 * Implements JIT (Just-In-Time) user creation with identity_links
 * Provider-agnostic: Routes through auth adapter (local GoTrue or Privy)
 */

import 'server-only'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { cacheStore } from './cache'
import { ErrorService } from '@/lib/errors/error-service'
import { AuthenticationError } from '@/lib/errors/types'
import { TTL } from '@/lib/cache/config'
import { getAuthProvider, getAuthProviderType, getAuthTokenCookieNames } from './adapter'
import { redactLogMetadata } from '@/lib/logging/safe-log'
import { resolveNativeAccessTokenUserId } from '@/lib/db/native-devices'

export type ServerSession = {
  userId: string | null
  isNewUser?: boolean
}

const sessionVerificationInflight = new Map<string, Promise<ServerSession>>()
const E2E_AUTH_COOKIE = 'lucid-e2e-auth'

function shouldLogAuthTimings(): boolean {
  return process.env.AUTH_TIMING_LOGS === 'true'
}

function logAuthTiming(payload: Record<string, unknown>) {
  if (!shouldLogAuthTimings()) return
  console.log('[auth:session]', redactLogMetadata(payload))
}

async function getNativeBearerToken(): Promise<string | null> {
  try {
    const authorization = (await headers()).get('authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    const token = match?.[1]?.trim()
    return token?.startsWith('native_access_') ? token : null
  } catch {
    return null
  }
}

export async function cacheServerSessionForToken(
  token: string,
  session: ServerSession,
  ttlSeconds = TTL.AUTH,
): Promise<void> {
  if (!token || !session.userId) return
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await cacheStore.set(`session:${tokenHash}`, session, ttlSeconds)
}

export function getDevBypassUserId(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  if (process.env.DISABLE_AUTH_REDIRECTS_IN_DEV !== 'true') return null
  const userId = process.env.DEV_AUTH_USER_ID?.trim()
  return userId || null
}

function getE2EAuthSigningSecret(): string | null {
  const explicitSecret = process.env.E2E_AUTH_BYPASS_SECRET?.trim()
  if (explicitSecret) return explicitSecret

  const isVercelPreview = process.env.VERCEL_ENV === 'preview'
  if (process.env.NODE_ENV === 'production' && !isVercelPreview) return null

  // Local and Vercel preview E2E runs can sign with the same service-role
  // secret already used by the test data seeder. Production requires an
  // explicit E2E_AUTH_BYPASS_SECRET and never falls back to service role.
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
}

function verifySignedE2ESession(rawCookie: string | undefined): ServerSession | null {
  const secret = getE2EAuthSigningSecret()
  if (!secret || !rawCookie) return null

  try {
    const decoded = JSON.parse(Buffer.from(rawCookie, 'base64url').toString('utf8')) as {
      userId?: unknown
      expiresAt?: unknown
      signature?: unknown
    }
    if (
      typeof decoded.userId !== 'string' ||
      typeof decoded.expiresAt !== 'number' ||
      typeof decoded.signature !== 'string' ||
      decoded.expiresAt <= Date.now()
    ) {
      return null
    }

    const payload = `${decoded.userId}:${decoded.expiresAt}`
    const expected = createHmac('sha256', secret).update(payload).digest('base64url')
    const actual = decoded.signature
    const expectedBuffer = Buffer.from(expected)
    const actualBuffer = Buffer.from(actual)
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      return null
    }

    return { userId: decoded.userId }
  } catch {
    return null
  }
}

/**
 * Gets the current server session with JIT user creation.
 * Returns internal user ID (UUID), not provider ID.
 *
 * Adapter-aware: reads the correct cookie based on AUTH_PROVIDER.
 */
export async function getServerSession(): Promise<ServerSession> {
  const startedAt = Date.now()
  let providerReadyAt = startedAt
  let cookiesReadyAt = startedAt
  let cacheReadyAt = startedAt
  let verifyReadyAt = startedAt
  let cacheSetReadyAt = startedAt
  try {
    const devBypassUserId = getDevBypassUserId()
    const providerType = getAuthProviderType()
    providerReadyAt = Date.now()
    const nativeBearerToken = await getNativeBearerToken()
    if (nativeBearerToken) {
      const userId = await resolveNativeAccessTokenUserId(nativeBearerToken)
      logAuthTiming({
        phase: 'complete',
        provider: providerType,
        source: userId ? 'native-bearer' : 'native-bearer-invalid',
        provider_ms: providerReadyAt - startedAt,
        total_ms: Date.now() - startedAt,
      })
      return { userId }
    }

    const cookieStore = await cookies()
    cookiesReadyAt = Date.now()
    const e2eSession = verifySignedE2ESession(cookieStore.get(E2E_AUTH_COOKIE)?.value)
    if (e2eSession) {
      logAuthTiming({
        phase: 'complete',
        provider: providerType,
        source: 'e2e-signed-bypass',
        provider_ms: providerReadyAt - startedAt,
        cookies_ms: cookiesReadyAt - providerReadyAt,
        total_ms: Date.now() - startedAt,
      })
      return e2eSession
    }

    // Try each cookie name the provider uses. Keep all candidate tokens because
    // Privy rotates its own cookies while Lucid also sets a stable server bridge
    // cookie. A cache hit for any valid token should satisfy the request.
    const tokenCandidates: Array<{ name: string; token: string; cacheKey: string }> = []
    const seenTokens = new Set<string>()
    for (const name of getAuthTokenCookieNames(providerType)) {
      const token = cookieStore.get(name)?.value
      if (!token || seenTokens.has(token)) continue
      seenTokens.add(token)
      tokenCandidates.push({
        name,
        token,
        cacheKey: `session:${createHash('sha256').update(token).digest('hex')}`,
      })
    }

    if (tokenCandidates.length === 0) {
      if (devBypassUserId) {
        logAuthTiming({
          phase: 'complete',
          provider: providerType,
          source: 'dev-bypass',
          provider_ms: providerReadyAt - startedAt,
          cookies_ms: cookiesReadyAt - providerReadyAt,
          total_ms: Date.now() - startedAt,
        })
        return { userId: devBypassUserId }
      }
      logAuthTiming({
        phase: 'complete',
        provider: providerType,
        source: 'anonymous',
        provider_ms: providerReadyAt - startedAt,
        cookies_ms: cookiesReadyAt - providerReadyAt,
        total_ms: Date.now() - startedAt,
      })
      return { userId: null }
    }

    let cachedSession: ServerSession | null = null
    let cachedCookieName: string | null = null
    for (const candidate of tokenCandidates) {
      const cached = await cacheStore.get(candidate.cacheKey)
      if (!cached) continue
      cachedSession = cached as ServerSession
      cachedCookieName = candidate.name
      break
    }
    cacheReadyAt = Date.now()
    if (cachedSession) {
      logAuthTiming({
        phase: 'complete',
        provider: providerType,
        source: 'cache',
        cacheHit: true,
        cookie: cachedCookieName,
        tokenCandidates: tokenCandidates.length,
        provider_ms: providerReadyAt - startedAt,
        cookies_ms: cookiesReadyAt - providerReadyAt,
        cache_ms: cacheReadyAt - cookiesReadyAt,
        total_ms: cacheReadyAt - startedAt,
      })
      return cachedSession
    }

    const existing = tokenCandidates
      .map((candidate) => sessionVerificationInflight.get(candidate.cacheKey))
      .find(Boolean)
    if (existing) {
      const session = await existing
      logAuthTiming({
        phase: 'complete',
        provider: getAuthProviderType(),
        source: 'inflight',
        cacheHit: false,
        total_ms: Date.now() - startedAt,
      })
      return session
    }

    // Verify via provider adapter
    const primaryCandidate = tokenCandidates[0]
    const inflight = (async () => {
      const providerLoadStartedAt = Date.now()
      const provider = await getAuthProvider()
      const providerLoadedAt = Date.now()
      let authSession: Awaited<ReturnType<typeof provider.verifyToken>> = null
      let verifiedCandidate: { name: string; token: string; cacheKey: string } | null = null
      for (const candidate of tokenCandidates) {
        authSession = await provider.verifyToken(candidate.token)
        if (authSession) {
          verifiedCandidate = candidate
          break
        }
      }
      verifyReadyAt = Date.now()
      if (!authSession) {
        if (devBypassUserId) {
          return { userId: devBypassUserId }
        }
        return { userId: null }
      }

      const session: ServerSession = {
        userId: authSession.userId,
        isNewUser: authSession.isNewUser,
      }

      // Set error tracking context
      ErrorService.setUser({
        id: authSession.userId,
        username: authSession.userId,
      })

      if (verifiedCandidate) {
        await cacheStore.set(verifiedCandidate.cacheKey, session, TTL.AUTH)
      }
      cacheSetReadyAt = Date.now()
      logAuthTiming({
        phase: 'verified-token',
        provider: providerType,
        cookie: verifiedCandidate?.name ?? null,
        tokenCandidates: tokenCandidates.length,
        provider_load_ms: providerLoadedAt - providerLoadStartedAt,
      })
      return session
    })()

    tokenCandidates.forEach((candidate) => {
      sessionVerificationInflight.set(candidate.cacheKey, inflight)
    })
    try {
      const session = await inflight
      logAuthTiming({
        phase: 'complete',
        provider: providerType,
        source: 'provider',
        cacheHit: false,
        cookie: primaryCandidate.name,
        tokenCandidates: tokenCandidates.length,
        provider_ms: providerReadyAt - startedAt,
        cookies_ms: cookiesReadyAt - providerReadyAt,
        cache_ms: cacheReadyAt - cookiesReadyAt,
        provider_verify_ms: verifyReadyAt - cacheReadyAt,
        cache_set_ms: cacheSetReadyAt - verifyReadyAt,
        total_ms: Date.now() - startedAt,
      })
      return session
    } finally {
      tokenCandidates.forEach((candidate) => {
        sessionVerificationInflight.delete(candidate.cacheKey)
      })
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'getServerSession' },
      tags: { layer: 'auth', function: 'getServerSession' },
    })
    ErrorService.clearUser()
    const devBypassUserId = getDevBypassUserId()
    if (devBypassUserId) {
      return { userId: devBypassUserId }
    }
    return { userId: null }
  }
}

/**
 * Requires authentication - throws if not authenticated.
 * Returns internal user ID (UUID).
 */
export async function requireUserId(): Promise<string> {
  const session = await getServerSession()
  if (!session.userId) {
    const error = new AuthenticationError('Unauthorized - authentication required')
    ErrorService.captureException(error, {
      severity: 'info',
      context: { operation: 'requireUserId' },
      tags: { layer: 'auth', function: 'requireUserId' },
    })
    throw error
  }
  return session.userId
}

/**
 * Requires authentication - returns provider external ID.
 *
 * For Privy: DID format (did:privy:xxx)
 * For Local: local:{gotrueUserId}
 *
 * Used by OAuth/external services that need the provider's native ID.
 */
export async function requireExternalId(): Promise<string> {
  try {
    const devBypassUserId = getDevBypassUserId()
    const provider = await getAuthProvider()
    const cookieStore = await cookies()

    let token: string | undefined
    for (const name of provider.tokenCookieNames) {
      token = cookieStore.get(name)?.value
      if (token) break
    }

    if (!token) {
      if (devBypassUserId) {
        return devBypassUserId
      }
      throw new AuthenticationError('Unauthorized - no token')
    }

    const externalId = await provider.getExternalId(token)
    if (!externalId) {
      if (devBypassUserId) {
        return devBypassUserId
      }
      throw new AuthenticationError('Unauthorized - invalid token')
    }

    return externalId
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'info',
      context: { operation: 'requireExternalId' },
      tags: { layer: 'auth', function: 'requireExternalId' },
    })
    const devBypassUserId = getDevBypassUserId()
    if (devBypassUserId) {
      return devBypassUserId
    }
    throw new AuthenticationError('Unauthorized - authentication required')
  }
}
