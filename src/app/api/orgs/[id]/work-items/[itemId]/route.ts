import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getWorkItemById,
  listWorkItemEvents,
  isUserOrgMember,
  getDagContextForWorkItem,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getWorkItemWithSignal } from '@/lib/work-items/signals'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orgs/[id]/work-items/[itemId]
 * Returns the work item + its activity feed (most recent 100 events).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
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

    const { id: orgId, itemId } = await params
    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const item = await getWorkItemById(itemId)
    if (!item || item.org_id !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const workItem = await getWorkItemWithSignal(item)

    const [events, dagContext] = await Promise.all([
      listWorkItemEvents(itemId, 100),
      item.kind === 'nerve_node' && item.dag_id && item.dag_node_id
        ? getDagContextForWorkItem(item.dag_id, item.dag_node_id)
        : Promise.resolve(null),
    ])
    return NextResponse.json({ workItem, events, dagContext })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/work-items/[itemId]', method: 'GET' },
      tags: { layer: 'api', route: 'work-items' },
    })
    return NextResponse.json({ error: 'Failed to load work item' }, { status: 500 })
  }
}
