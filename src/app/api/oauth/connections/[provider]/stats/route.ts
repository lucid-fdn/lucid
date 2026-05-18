/**
 * OAuth Connection Stats API Route
 *
 * Returns usage statistics for a provider's connections.
 * Currently returns empty stats — usage tracking via org_integration_connections
 * is planned but not yet implemented.
 *
 * Security:
 *   - Auth required (Privy userId)
 *   - Rate limited (20/min per user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY_STATS = { totalCalls: 0, last24Hours: 0, lastUsed: null, successRate: 0 }

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    await params

    const userId = await requireUserId()

    const rl = await checkRateLimit(`oauth:stats:${userId}`, OAuthRateLimits.STATS)
    if (!rl.success) {
      return NextResponse.json(
        { stats: EMPTY_STATS },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    return NextResponse.json({ stats: EMPTY_STATS })
  } catch {
    return NextResponse.json({ stats: EMPTY_STATS })
  }
}
