import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { listKnowledgeSources } from '@/lib/db/knowledge'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  sourceKey: z.string().min(1).max(240).optional(),
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = querySchema.parse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      teamId: req.nextUrl.searchParams.get('team_id') ?? undefined,
      sourceId: req.nextUrl.searchParams.get('source_id') ?? undefined,
      sourceKey: req.nextUrl.searchParams.get('source_key') ?? undefined,
      includeArchived: req.nextUrl.searchParams.get('include_archived') ?? undefined,
    })
    const access = await resolveKnowledgeManagerAccess({ userId, orgId: parsed.orgId })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const sources = await listKnowledgeSources({
      orgId: parsed.orgId,
      projectId: parsed.projectId,
      teamId: parsed.teamId,
      sourceId: parsed.sourceId,
      sourceKey: parsed.sourceKey,
      includeArchived: parsed.includeArchived,
      limit: 200,
    })

    return NextResponse.json({ sources })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/brain/sources', method: 'GET' },
      tags: { layer: 'api', route: 'brain-runtime' },
    })
    return NextResponse.json({ error: 'Failed to list Brain sources' }, { status: 500 })
  }
}
