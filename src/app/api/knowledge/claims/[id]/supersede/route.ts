import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  KnowledgeClaimEvidenceSchema,
  KnowledgeClaimHolderTypeSchema,
  KnowledgeClaimStatusSchema,
  KnowledgeClaimTypeSchema,
} from '@contracts/knowledge-claims'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { supersedeKnowledgeClaim } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const supersedeClaimBodySchema = z.object({
  org_id: z.string().uuid(),
  replacement: z.object({
    project_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    assistant_id: z.string().uuid().nullable().optional(),
    source_id: z.string().uuid().nullable().optional(),
    page_id: z.string().uuid().nullable().optional(),
    claim_type: KnowledgeClaimTypeSchema.default('claim'),
    subject: z.string().min(1).max(240),
    claim: z.string().min(1).max(8000),
    holder_type: KnowledgeClaimHolderTypeSchema.default('operator'),
    holder_id: z.string().max(240).nullable().optional(),
    confidence: z.number().min(0).max(1).default(0.7),
    weight: z.number().min(0).max(1).default(0.5),
    status: KnowledgeClaimStatusSchema.default('active'),
    valid_from: z.string().datetime().nullable().optional(),
    valid_until: z.string().datetime().nullable().optional(),
    evidence: z.array(KnowledgeClaimEvidenceSchema).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = supersedeClaimBodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const { id } = await ctx.params
    const replacement = body.replacement
    const result = await supersedeKnowledgeClaim({
      orgId: body.org_id,
      claimId: id,
      actorUserId: userId,
      replacement: {
        orgId: body.org_id,
        projectId: replacement.project_id ?? null,
        teamId: replacement.team_id ?? null,
        assistantId: replacement.assistant_id ?? null,
        sourceId: replacement.source_id ?? null,
        pageId: replacement.page_id ?? null,
        claimType: replacement.claim_type,
        subject: replacement.subject,
        claim: replacement.claim,
        holderType: replacement.holder_type,
        holderId: replacement.holder_id ?? null,
        confidence: replacement.confidence,
        weight: replacement.weight,
        status: replacement.status,
        validFrom: replacement.valid_from ?? null,
        validUntil: replacement.valid_until ?? null,
        evidence: replacement.evidence,
        metadata: replacement.metadata,
        createdByUserId: userId,
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims/[id]/supersede', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-claims' },
    })
    return NextResponse.json({ error: 'Failed to supersede knowledge claim' }, { status: 500 })
  }
})
