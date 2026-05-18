/**
 * OAuth Initiate API Route
 *
 * Proxies OAuth initiation requests to Nango backend.
 *
 * Security:
 *   - Rate limited (10/min per user)
 *   - Timeout protected (30s)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'
import { nangoBackendFetch } from '@/lib/oauth/nango-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params
    const userId = await requireUserId()

    // Rate limit
    const rl = await checkRateLimit(`oauth:initiate:${userId}`, OAuthRateLimits.INITIATE)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    const cookieStore = await cookies()
    const privyToken = cookieStore.get('privy-token')?.value
    if (!privyToken) {
      return NextResponse.json({ error: 'Unauthorized - No authentication token' }, { status: 401 })
    }

    const body = await request.json()

    const result = await nangoBackendFetch(`/api/oauth/${provider}/initiate`, {
      method: 'POST',
      privyToken,
      userId,
      body: { ...body, userId },
      label: 'initiate',
      skipRetry: true, // Interactive flow — don't add retry latency
    })

    if (!result.ok) {
      ErrorService.captureException(
        new Error(`Nango OAuth initiate failed: ${result.status}`),
        {
          severity: 'error',
          context: { endpoint: `/api/oauth/${provider}/initiate`, nangoStatus: result.status, provider, userId },
          tags: { layer: 'api', route: 'oauth-initiate' },
        },
      )
      return NextResponse.json({ error: 'Failed to initiate OAuth flow' }, { status: result.status })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    const { provider } = await params
    console.error('[OAuth Initiate API] Error:', error)

    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: `/api/oauth/${provider}/initiate`, method: 'POST', provider },
      tags: { layer: 'api', route: 'oauth-initiate' },
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
