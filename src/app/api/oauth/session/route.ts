/**
 * OAuth Session Token API Route
 *
 * Creates Nango session tokens for authenticated users.
 * Enables the Nango Connect UI popup-based OAuth flow.
 *
 * Security:
 *   - Rate limited (10/min per user)
 *   - Enforces allowed_integrations when provider is specified
 *   - Timeout protected (30s)
 *
 * @see https://docs.nango.dev/reference/api/session/create
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'
import {
  createNangoSessionToken,
  getNangoApiBaseUrl,
  getNangoUserFacingError,
  getOAuthApiBaseUrl,
  summarizeNangoFailure,
} from '@/lib/oauth/nango-fetch'
import { maskIdentifier, redactLogMetadata, summarizeError } from '@/lib/logging/safe-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeConnectLink(connectLink: string, nangoBaseUrl: string): string {
  try {
    const parsed = new URL(connectLink)
    const isLocalNangoFrontend =
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.port === '3009'

    if (!isLocalNangoFrontend) {
      return connectLink
    }

    const hostedBase = new URL(nangoBaseUrl)
    parsed.protocol = hostedBase.protocol
    parsed.hostname = hostedBase.hostname
    parsed.port = hostedBase.port
    parsed.pathname = hostedBase.pathname || '/'
    return parsed.toString()
  } catch {
    return connectLink
  }
}

async function resolveMondayAuthUrl(connectUrl: string): Promise<string> {
  try {
    const response = await fetch(connectUrl, {
      method: 'GET',
      redirect: 'manual',
    })

    const location = response.headers.get('location')
    if (!location) {
      return connectUrl
    }

    return location.replace('oauth2/authorize?=code&', 'oauth2/authorize?response_type=code&')
  } catch {
    return connectUrl
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()

    // Rate limit
    const rl = await checkRateLimit(`oauth:session:${userId}`, OAuthRateLimits.SESSION)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    const body = await request.json().catch(() => ({}))
    const { provider, email, displayName } = body

    const result = await createNangoSessionToken({
      userId,
      email,
      displayName,
      provider, // Enforces allowed_integrations when present
    })

    if (!result.ok) {
      const upstreamSummary = summarizeNangoFailure(result.data)
      console.error('[OAuth Session API] Nango session creation failed:', {
        status: result.status,
        upstreamSummary,
        provider,
        userId: maskIdentifier(userId),
      })
      ErrorService.captureException(
        new Error(`Nango session creation failed: ${result.status}`),
        {
          severity: 'error',
          context: { endpoint: '/api/oauth/session', nangoStatus: result.status, provider, userId: maskIdentifier(userId) ?? undefined, upstreamSummary },
          tags: { layer: 'api', route: 'oauth-session' },
        },
      )
      return NextResponse.json(
        {
          error: getNangoUserFacingError(result.status, result.data),
          upstreamStatus: result.status,
          ...(process.env.NODE_ENV !== 'production' && upstreamSummary ? { upstreamSummary } : {}),
        },
        { status: result.status },
      )
    }

    const data = result.data as { data: { token: string; connect_link: string; expires_at: string } }
    const sessionToken = data.data.token

    // Build direct OAuth URL that skips the Nango Connect UI.
    // Nango's /oauth/connect/{provider}?connect_session_token={token} redirects
    // straight to the provider's authorization page.
    const oauthApiUrl = getOAuthApiBaseUrl()
    const nangoBaseUrl = getNangoApiBaseUrl()
    const connectLink = normalizeConnectLink(data.data.connect_link, nangoBaseUrl)
    // The hosted Nango frontend currently serves under /nango, but its HTML
    // still references absolute /assets and /env.js paths. On our proxy that
    // yields a blank page, so prefer the backend connect shortcut whenever a
    // provider is known. Monday's direct redirect currently comes back with a
    // malformed `?=code` query segment, so resolve and repair that server-side.
    const directConnectUrl = provider
      ? `${nangoBaseUrl}/oauth/connect/${provider}?connect_session_token=${sessionToken}`
      : null
    const authUrl = provider
      ? provider === 'monday'
        ? await resolveMondayAuthUrl(directConnectUrl!)
        : directConnectUrl!
      : connectLink

    console.log('[OAuth Session] SUCCESS', {
      provider,
      hasAuthUrl: Boolean(authUrl),
      oauthApiUrl,
      nangoBaseUrl,
    })

    return NextResponse.json({
      sessionToken,
      authUrl,
      connectLink,
      expiresAt: data.data.expires_at,
      providerId: provider,
    })
  } catch (error) {
    console.error('[OAuth Session API] Error:', summarizeError(error))

    ErrorService.captureException(error, {
      severity: 'error',
      context: redactLogMetadata({ endpoint: '/api/oauth/session', method: 'POST' }),
      tags: { layer: 'api', route: 'oauth-session' },
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
