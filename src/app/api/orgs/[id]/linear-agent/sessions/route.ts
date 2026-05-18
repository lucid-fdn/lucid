/**
 * GET /api/orgs/[id]/linear-agent/sessions — List Linear agent sessions.
 *
 * Returns recent Linear agent sessions for the org, optionally filtered by status.
 * Any org member can read.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 4
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, getLinearAgentSessions } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  checkRateLimit,
  getRequestIdentifier,
  RateLimitPresets,
} from '@/lib/auth/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(
      getRequestIdentifier(req),
      RateLimitPresets.RELAXED,
    )
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params
    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') ?? undefined
    const limit = searchParams.get('limit')
      ? Math.min(parseInt(searchParams.get('limit')!, 10), 100)
      : undefined

    const sessions = await getLinearAgentSessions(orgId, { status, limit })
    return NextResponse.json({ sessions })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/linear-agent/sessions', method: 'GET' },
      tags: { layer: 'api', route: 'linear-agent-sessions' },
    })
    return NextResponse.json(
      { error: 'Failed to load Linear agent sessions' },
      { status: 500 },
    )
  }
}
