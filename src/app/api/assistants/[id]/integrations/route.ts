/**
 * Integration Status API
 *
 * GET /api/assistants/[id]/integrations
 *
 * Returns all integrations with connection status for a given assistant.
 * Thin wrapper over the centralized integration service.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { getIntegrations } from '@/lib/integrations'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integrations = await getIntegrations(assistantId, assistant.org_id)

    const res = NextResponse.json({ integrations })
    res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
    return res
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/integrations', method: 'GET' },
      tags: { layer: 'api', route: 'integrations' },
    })
    return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 })
  }
}
