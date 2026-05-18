import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole, isUserOrgMember, updateKnowledgeMaintenanceEventStatus } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const bodySchema = z.object({
  org_id: z.string().uuid(),
  status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']),
})

export const PATCH = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = bodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const event = await updateKnowledgeMaintenanceEventStatus({
      orgId: body.org_id,
      eventId: id,
      status: body.status,
    })
    if (!event) return NextResponse.json({ error: 'Knowledge maintenance event not found' }, { status: 404 })
    return NextResponse.json({ event })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/maintenance/events/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to update knowledge maintenance event' }, { status: 500 })
  }
})
