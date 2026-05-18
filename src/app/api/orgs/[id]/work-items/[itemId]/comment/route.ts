import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { commentOnWorkItem, getWorkItemById } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { requireOrgPermission } from '@/lib/access-control/api'

export const dynamic = 'force-dynamic'

const commentSchema = z.object({
  body: z.string().min(1).max(10_000),
})

/**
 * POST /api/orgs/[id]/work-items/[itemId]/comment
 * Appends a free-form comment to the work item activity feed.
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

    const body = await req.json()
    const validated = commentSchema.parse(body)

    const ok = await commentOnWorkItem(itemId, orgId, userId, validated.body)
    if (!ok) {
      return NextResponse.json({ error: 'Empty comment' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/work-items/[itemId]/comment', method: 'POST' },
      tags: { layer: 'api', route: 'work-items' },
    })
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
  }
})
