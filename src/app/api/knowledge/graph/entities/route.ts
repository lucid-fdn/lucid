import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { findKnowledgeEntities, ingestKnowledgeGraphFromText, isUserOrgMember, upsertKnowledgeEntity } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import type { KnowledgeEntityType } from '@/lib/knowledge/types'

export const dynamic = 'force-dynamic'

const entityTypeSchema = z.enum([
  'person',
  'company',
  'project',
  'repo',
  'pull_request',
  'channel',
  'url',
  'agent',
  'decision',
  'integration',
  'topic',
])

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  query: z.string().optional(),
  types: z.string().optional(),
  limit: z.string().optional().transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('extract'),
    org_id: z.string().uuid(),
    project_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    source_id: z.string().uuid().nullable().optional(),
    page_id: z.string().uuid().nullable().optional(),
    event_id: z.string().uuid().nullable().optional(),
    text: z.string().min(1).max(30000),
  }),
  z.object({
    action: z.literal('upsert'),
    org_id: z.string().uuid(),
    project_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    source_id: z.string().uuid().nullable().optional(),
    type: entityTypeSchema,
    canonical_name: z.string().min(1).max(240),
    description: z.string().max(4000).nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
])

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      teamId: req.nextUrl.searchParams.get('team_id') ?? undefined,
      query: req.nextUrl.searchParams.get('query') ?? undefined,
      types: req.nextUrl.searchParams.get('types') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    if (!(await isUserOrgMember(userId, parsed.data.orgId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const types = parsed.data.types
      ?.split(',')
      .map((type) => type.trim())
      .filter((type): type is KnowledgeEntityType => entityTypeSchema.safeParse(type).success)

    const entities = await findKnowledgeEntities({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      teamId: parsed.data.teamId,
      query: parsed.data.query,
      types,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ entities })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/graph/entities', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge entities' }, { status: 500 })
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

    if (body.action === 'extract') {
      const graph = await ingestKnowledgeGraphFromText({
        orgId: body.org_id,
        projectId: body.project_id,
        teamId: body.team_id,
        sourceId: body.source_id,
        pageId: body.page_id,
        eventId: body.event_id,
        text: body.text,
      })
      return NextResponse.json(graph, { status: 201 })
    }

    const entity = await upsertKnowledgeEntity({
      orgId: body.org_id,
      projectId: body.project_id,
      teamId: body.team_id,
      sourceId: body.source_id,
      type: body.type,
      canonicalName: body.canonical_name,
      description: body.description,
      confidence: body.confidence,
      metadata: body.metadata,
    })
    if (!entity) return NextResponse.json({ error: 'Failed to write knowledge entity' }, { status: 500 })
    return NextResponse.json({ entity }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/graph/entities', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to write knowledge graph' }, { status: 500 })
  }
})
