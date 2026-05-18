import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, updateSystemNoticeStatus } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({ id: z.string().uuid() })
const patchSchema = z.object({
  org_id: z.string().uuid(),
  action: z.enum(['acknowledge', 'resolve', 'reopen']),
})

export const PATCH = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { params } = ctx as { params: Promise<{ id: string }> }
    const { id } = routeParamsSchema.parse(await params)
    const body = patchSchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const notice = await updateSystemNoticeStatus({ orgId: body.org_id, noticeId: id, action: body.action })
    if (!notice) return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
    return NextResponse.json({ notice })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/notices/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'mission-control-notices' },
    })
    return NextResponse.json({ error: 'Failed to update notice' }, { status: 500 })
  }
})
