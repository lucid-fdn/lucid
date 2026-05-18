import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, listKnowledgeMaintenanceEvents } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  limit: z.string().optional().transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      severity: req.nextUrl.searchParams.get('severity') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    if (!(await isUserOrgMember(userId, parsed.data.orgId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const events = await listKnowledgeMaintenanceEvents({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      status: parsed.data.status,
      severity: parsed.data.severity,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ events })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/maintenance/events', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge maintenance events' }, { status: 500 })
  }
}
