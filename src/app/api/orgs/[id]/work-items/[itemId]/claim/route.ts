import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { claimWorkItem, getWorkItemById } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { getWorkItemWithSignal } from '@/lib/work-items/signals'
import { requireOrgPermission } from '@/lib/access-control/api'

export const dynamic = 'force-dynamic'

/**
 * POST /api/orgs/[id]/work-items/[itemId]/claim
 * Assigns the work item to the current user and marks it in_progress.
 */
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId, itemId } = await (
      ctx as { params: Promise<{ id: string; itemId: string }> }
    ).params

    const access = await requireOrgPermission(userId, orgId, 'editProjects')
    if (!access.ok) return access.response

    const existing = await getWorkItemById(itemId)
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.status === 'done' || existing.status === 'cancelled' || existing.status === 'rejected') {
      return NextResponse.json({ error: 'Work item already resolved' }, { status: 409 })
    }
    const enriched = await getWorkItemWithSignal(existing)
    if (existing.status === 'in_progress') {
      if (existing.assignee_user_id === userId) {
        return NextResponse.json({ workItem: enriched })
      }
      return NextResponse.json(
        {
          error: 'Work item already claimed',
          detail: enriched.signal.detail,
          signal: enriched.signal,
        },
        { status: 409 },
      )
    }
    if (!enriched.signal.readyForOperator) {
      return NextResponse.json(
        {
          error: 'Work item is not ready to claim',
          detail: enriched.signal.detail,
          signal: enriched.signal,
        },
        { status: 409 },
      )
    }

    const claimed = await claimWorkItem(itemId, userId)
    if (!claimed) {
      return NextResponse.json({ error: 'Failed to claim work item' }, { status: 500 })
    }

    return NextResponse.json({ workItem: await getWorkItemWithSignal(claimed) })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/work-items/[itemId]/claim', method: 'POST' },
      tags: { layer: 'api', route: 'work-items' },
    })
    return NextResponse.json({ error: 'Failed to claim work item' }, { status: 500 })
  }
})
