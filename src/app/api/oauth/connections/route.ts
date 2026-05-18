/**
 * OAuth Connections API Route
 *
 * Proxies requests to the Nango backend for getting user's OAuth connections.
 * Normalizes snake_case backend fields to camelCase frontend fields.
 *
 * Security:
 *   - Rate limited (30/min per user)
 *   - Timeout protected (30s)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'
import { nangoBackendFetch, nangoFetch } from '@/lib/oauth/nango-fetch'
import { getDevBypassUserId } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NANGO_API_URL = process.env.NANGO_API_BASE || `${process.env.NEXT_PUBLIC_OAUTH_API_URL || 'http://localhost:3001'}/nango`
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY

interface NangoConnection {
  id: number
  connection_id: string
  provider_config_key: string
  provider: string
  end_user: { id: string } | null
  created: string
  metadata?: Record<string, unknown>
}

export async function GET(_request: NextRequest) {
  try {
    const { requireExternalId } = await import('@/lib/auth/session')
    const privyUserId = await requireExternalId()

    // Rate limit
    const rl = await checkRateLimit(`oauth:connections:${privyUserId}`, OAuthRateLimits.CONNECTIONS)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests', connections: [] },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    const cookieStore = await cookies()
    const privyToken = cookieStore.get('privy-token')?.value
    const devBypassUserId = getDevBypassUserId()

    const result = privyToken
      ? await nangoBackendFetch<{ connections?: Record<string, unknown>[] }>('/api/oauth/connections', {
          privyToken,
          label: 'connections-list',
          skipRetry: true,
        })
      : devBypassUserId && NANGO_SECRET_KEY
        ? await nangoFetch<{ connections?: NangoConnection[] }>({
            url: `${NANGO_API_URL}/connections`,
            method: 'GET',
            headers: { Authorization: `Bearer ${NANGO_SECRET_KEY}` },
            label: 'connections-list-dev-bypass',
            skipRetry: true,
          }).then((response) => ({
            ...response,
            data: {
              connections: (response.data?.connections ?? []).filter(
                (conn) => conn.end_user?.id === privyUserId,
              ) as unknown as Record<string, unknown>[],
            },
          }))
        : { ok: false, status: 401, data: { connections: [] }, headers: new Headers() }

    if (!result.ok) {
      ErrorService.captureException(new Error(`Nango API error: ${result.status}`), {
        severity: 'warning',
        context: { endpoint: '/api/oauth/connections', nangoStatus: result.status, privyUserId },
        tags: { layer: 'api', route: 'oauth-connections' },
      })
      return NextResponse.json({ connections: [] })
    }

    const rawData = result.data
    const normalizedConnections = (rawData.connections || []).map((conn: Record<string, unknown>) => ({
      id: conn.id,
      connectionId: conn.connectionId || conn.nango_connection_id || conn.connection_id,
      provider: conn.provider,
      providerName: conn.providerName || conn.provider_name || conn.provider,
      userId: conn.userId || conn.user_id || conn.privy_user_id || privyUserId,
      connectedAt: conn.connectedAt || conn.connected_at || conn.created_at,
      isActive: conn.isActive !== undefined ? conn.isActive : conn.is_active !== false,
      username: conn.username || conn.providerUsername || conn.provider_username || conn.provider_account_name,
      email: conn.email || conn.providerEmail || conn.provider_email || conn.provider_account_email,
      displayName: conn.displayName || conn.providerDisplayName || conn.provider_display_name || conn.name,
      avatarUrl: conn.avatarUrl || conn.providerAvatarUrl || conn.provider_avatar_url || conn.avatar || conn.profilePicture || conn.profile_picture,
      expiresAt: conn.expiresAt || conn.expires_at,
      metadata: conn.metadata,
    }))

    return NextResponse.json({ connections: normalizedConnections })
  } catch (error) {
    console.error('[OAuth Connections API] Error:', error)

    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/oauth/connections', method: 'GET' },
      tags: { layer: 'api', route: 'oauth-connections' },
    })

    return NextResponse.json({ connections: [] })
  }
}
