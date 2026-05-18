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
import { createKnowledgeClaim, listKnowledgeClaims } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const listClaimsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  query: z.string().max(500).nullable().optional(),
  status: KnowledgeClaimStatusSchema.optional(),
  claim_type: KnowledgeClaimTypeSchema.optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const createClaimBodySchema = z.object({
  org_id: z.string().uuid(),
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
  claim_metric: z.string().min(1).max(120).nullable().optional(),
  claim_value: z.number().finite().nullable().optional(),
  claim_unit: z.string().max(80).nullable().optional(),
  claim_period: z.string().max(80).nullable().optional(),
  observed_at: z.string().datetime().nullable().optional(),
  evidence: z.array(KnowledgeClaimEvidenceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listClaimsQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      team_id: req.nextUrl.searchParams.get('team_id') ?? undefined,
      assistant_id: req.nextUrl.searchParams.get('assistant_id') ?? undefined,
      query: req.nextUrl.searchParams.get('query') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      claim_type: req.nextUrl.searchParams.get('claim_type') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: parsed.data.org_id,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const claims = await listKnowledgeClaims({
      orgId: parsed.data.org_id,
      projectId: parsed.data.project_id,
      teamId: parsed.data.team_id,
      assistantId: parsed.data.assistant_id,
      query: parsed.data.query,
      status: parsed.data.status,
      claimType: parsed.data.claim_type,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ claims })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-claims' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge claims' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createClaimBodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const claim = await createKnowledgeClaim({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      teamId: body.team_id ?? null,
      assistantId: body.assistant_id ?? null,
      sourceId: body.source_id ?? null,
      pageId: body.page_id ?? null,
      claimType: body.claim_type,
      subject: body.subject,
      claim: body.claim,
      holderType: body.holder_type,
      holderId: body.holder_id ?? null,
      confidence: body.confidence,
      weight: body.weight,
      status: body.status,
      validFrom: body.valid_from ?? null,
      validUntil: body.valid_until ?? null,
      claimMetric: body.claim_metric ?? null,
      claimValue: body.claim_value ?? null,
      claimUnit: body.claim_unit ?? null,
      claimPeriod: body.claim_period ?? null,
      observedAt: body.observed_at ?? null,
      evidence: body.evidence,
      metadata: body.metadata,
      createdByUserId: userId,
    })
    return NextResponse.json({ claim }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-claims' },
    })
    return NextResponse.json({ error: 'Failed to create knowledge claim' }, { status: 500 })
  }
})
