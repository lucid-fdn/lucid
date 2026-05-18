import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { listNeedsHumanItems } from '@/lib/mission-control/needs-human'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  domain: z.string().max(80).nullable().optional(),
  limit: z.string().optional().transform((value) => (value ? Number.parseInt(value, 10) : undefined)).pipe(z.number().int().positive().max(250).optional()),
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
      domain: req.nextUrl.searchParams.get('domain') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    if (!(await isUserOrgMember(userId, parsed.data.orgId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const items = await listNeedsHumanItems(parsed.data)
    return NextResponse.json({ items })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/needs-human', method: 'GET' },
      tags: { layer: 'api', route: 'mission-control-needs-human' },
    })
    return NextResponse.json({ error: 'Failed to list Needs Human items' }, { status: 500 })
  }
}
