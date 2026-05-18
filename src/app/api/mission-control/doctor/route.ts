import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { LucidDoctorDomainSchema } from '@contracts/lucid-doctor'
import { getUserId } from '@/lib/auth/server-utils'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { buildLucidDoctorReport } from '@/lib/doctor/lucid-doctor'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  domain: z.string().nullable().optional(),
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

    const domains = parsed.data.domain
      ? parsed.data.domain.split(',').map((domain) => LucidDoctorDomainSchema.parse(domain.trim()))
      : undefined
    const report = await buildLucidDoctorReport({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      domains,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ report })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/doctor', method: 'GET' },
      tags: { layer: 'api', route: 'mission-control-doctor' },
    })
    return NextResponse.json({ error: 'Failed to build Lucid Doctor report' }, { status: 500 })
  }
}
