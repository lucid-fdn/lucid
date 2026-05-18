import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { KnowledgeScorecardProfileSchema } from '@contracts/knowledge-intelligence'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'
import { buildKnowledgeEntityScorecard } from '@/lib/knowledge/intelligence/scorecard'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  org_id: z.string().uuid(),
  subject: z.string().min(1).max(240),
  profile: KnowledgeScorecardProfileSchema.default('company'),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  metric: z.string().max(120).nullable().optional(),
  since: z.string().datetime().nullable().optional(),
  until: z.string().datetime().nullable().optional(),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = bodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({ userId, orgId: body.org_id })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const scorecard = await buildKnowledgeEntityScorecard({
      orgId: body.org_id,
      subject: body.subject,
      profile: body.profile,
      projectId: body.project_id ?? null,
      teamId: body.team_id ?? null,
      assistantId: body.assistant_id ?? null,
      metric: body.metric ?? null,
      since: body.since ?? null,
      until: body.until ?? null,
    })

    return NextResponse.json({ scorecard })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/scorecards', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-scorecards' },
    })
    return NextResponse.json({ error: 'Failed to compute knowledge scorecard' }, { status: 500 })
  }
})
