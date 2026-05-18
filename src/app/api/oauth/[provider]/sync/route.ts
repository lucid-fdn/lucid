/**
 * OAuth Sync API Route
 *
 * Forwards OAuth sync request to Nango backend after successful OAuth flow.
 *
 * Security:
 *   - Auth required (Privy userId)
 *   - Timeout protected (30s)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import { nangoBackendFetch } from '@/lib/oauth/nango-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ provider: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { provider } = await params

    // Auth gate — throws 401 if not authenticated
    await requireUserId()

    let body: { connectionId?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Body might be empty
    }

    const cookieStore = await cookies()
    const privyToken = cookieStore.get('privy-token')?.value

    if (!privyToken) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 })
    }

    // Forward to Nango backend
    const result = await nangoBackendFetch(`/api/oauth/${provider}/sync`, {
      method: 'POST',
      privyToken,
      body,
      label: 'sync',
      skipRetry: true,
    })

    if (!result.ok) {
      ErrorService.captureException(new Error(`OAuth sync failed: ${result.status}`), {
        severity: 'warning',
        context: {
          endpoint: `/api/oauth/${provider}/sync`,
          nangoStatus: result.status,
          provider,
          connectionId: body.connectionId,
        },
        tags: { layer: 'api', route: 'oauth-sync' },
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Sync failed',
          details: (result.data as Record<string, unknown>)?.error || (result.data as Record<string, unknown>)?.message || result.data,
          backendStatus: result.status,
          provider,
          connectionId: body.connectionId,
        },
        { status: result.status },
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[OAuth Sync API] Error:', error)

    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/oauth/[provider]/sync', method: 'POST' },
      tags: { layer: 'api', route: 'oauth-sync' },
    })

    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
