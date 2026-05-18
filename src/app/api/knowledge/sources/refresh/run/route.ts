import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getWorkerUrl } from '@/lib/worker/config'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const bodySchema = z.object({
  org_id: z.string().uuid(),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = bodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })

    const workerUrl = getWorkerUrl()
    if (!workerUrl) return NextResponse.json({ error: 'WORKER_URL not configured' }, { status: 503 })

    const response = await fetch(`${workerUrl}/trigger`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.WORKER_TRIGGER_SECRET ? { authorization: `Bearer ${process.env.WORKER_TRIGGER_SECRET}` } : {}),
      },
      body: JSON.stringify({
        event_type: 'knowledge_source_refresh',
        org_id: body.org_id,
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return NextResponse.json({
        error: `Worker trigger failed with ${response.status}`,
        details: text.slice(0, 300) || undefined,
      }, { status: 502 })
    }

    return NextResponse.json({
      triggered: true,
      eventType: 'knowledge_source_refresh',
      orgId: body.org_id,
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/sources/refresh/run', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to trigger Knowledge source refresh' }, { status: 500 })
  }
})
