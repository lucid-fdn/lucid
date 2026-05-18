import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'
import { findKnowledgeTrajectory } from '@/lib/knowledge/intelligence/trajectory'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  subject: z.string().min(1).max(240),
  metric: z.string().max(120).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  since: z.string().datetime().nullable().optional(),
  until: z.string().datetime().nullable().optional(),
  limit: z.string().optional().transform((value) => (value ? Number.parseInt(value, 10) : undefined)).pipe(z.number().int().positive().max(1000).optional()),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      subject: req.nextUrl.searchParams.get('subject'),
      metric: req.nextUrl.searchParams.get('metric') ?? undefined,
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      teamId: req.nextUrl.searchParams.get('team_id') ?? undefined,
      assistantId: req.nextUrl.searchParams.get('assistant_id') ?? undefined,
      since: req.nextUrl.searchParams.get('since') ?? undefined,
      until: req.nextUrl.searchParams.get('until') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })

    const access = await resolveKnowledgeManagerAccess({ userId, orgId: parsed.data.orgId })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const trajectory = await findKnowledgeTrajectory(parsed.data)
    return NextResponse.json({ trajectory })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/trajectory', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-trajectory' },
    })
    return NextResponse.json({ error: 'Failed to compute knowledge trajectory' }, { status: 500 })
  }
}
