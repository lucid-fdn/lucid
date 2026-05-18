import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { DECISION_RISK_LEVELS, decisionPreferenceInputSchema } from '@/lib/agent-ops/project-learnings'
import { createDecisionPreference, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const createDecisionPreferenceBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  key: z.string().min(1).max(160),
  question_pattern: z.string().min(1).max(1000),
  preferred_decision: z.string().min(1).max(1000),
  risk_level: z.enum(DECISION_RISK_LEVELS).optional(),
  source_kind: z.enum(['manual', 'retro', 'operator_approved']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = createDecisionPreferenceBodySchema.parse(await req.json())
    const body = decisionPreferenceInputSchema.parse({
      orgId: rawBody.org_id,
      projectId: rawBody.project_id ?? null,
      key: rawBody.key,
      questionPattern: rawBody.question_pattern,
      preferredDecision: rawBody.preferred_decision,
      riskLevel: rawBody.risk_level,
      sourceKind: rawBody.source_kind,
      metadata: rawBody.metadata,
      createdBy: userId,
    })

    const isMember = await isUserOrgMember(userId, body.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const preference = await createDecisionPreference(body)
    return NextResponse.json({ preference }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/decision-preferences', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create decision preference' }, { status: 500 })
  }
})
