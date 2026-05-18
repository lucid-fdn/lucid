import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
  listKnowledgeRetrievalEvalCases,
  upsertKnowledgeRetrievalEvalCase,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  category: z.enum(['preference', 'project_fact', 'org_policy', 'source_conflict', 'evidence_heavy']).optional(),
  status: z.enum(['active', 'archived']).optional(),
  limit: z.string().optional().transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

const bodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  slug: z.string().min(1).max(160),
  category: z.enum(['preference', 'project_fact', 'org_policy', 'source_conflict', 'evidence_heavy']),
  query: z.string().min(1).max(4000),
  expected_item_ids: z.array(z.string()).optional(),
  expected_citation_keys: z.array(z.string()).optional(),
  required_layers: z.array(z.enum(['session', 'assistant_memory', 'team_brain', 'project_brain', 'org_brain', 'rag', 'evidence', 'l2'])).optional(),
  baseline_top_item_id: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
      category: req.nextUrl.searchParams.get('category') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    if (!(await isUserOrgMember(userId, parsed.data.orgId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const cases = await listKnowledgeRetrievalEvalCases({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      category: parsed.data.category,
      status: parsed.data.status,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ cases })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/evals/cases', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list Knowledge retrieval eval cases' }, { status: 500 })
  }
}

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

    const evalCase = await upsertKnowledgeRetrievalEvalCase({
      orgId: body.org_id,
      projectId: body.project_id,
      teamId: body.team_id,
      slug: body.slug,
      category: body.category,
      query: body.query,
      expectedItemIds: body.expected_item_ids,
      expectedCitationKeys: body.expected_citation_keys,
      requiredLayers: body.required_layers,
      baselineTopItemId: body.baseline_top_item_id,
      metadata: body.metadata,
      createdBy: userId,
    })
    if (!evalCase) return NextResponse.json({ error: 'Failed to write eval case' }, { status: 500 })
    return NextResponse.json({ case: evalCase }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/evals/cases', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to write Knowledge retrieval eval case' }, { status: 500 })
  }
})
