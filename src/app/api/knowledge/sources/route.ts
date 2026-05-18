import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { createKnowledgeSource, isUserOrgMember, listKnowledgeSources } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { createKnowledgeSourceSchema } from '@/features/knowledge-manager/schema'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  sourceType: z.enum(['channel', 'file', 'repo', 'url', 'run', 'manual', 'project', 'team', 'org', 'engine_home', 'agent_ops', 'board_memory']).optional(),
  status: z.enum(['active', 'paused', 'stale', 'errored', 'archived']).optional(),
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  dueForRefreshOnly: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
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
      teamId: req.nextUrl.searchParams.get('team_id') ?? undefined,
      sourceType: req.nextUrl.searchParams.get('source_type') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      includeArchived: req.nextUrl.searchParams.get('include_archived') ?? undefined,
      dueForRefreshOnly: req.nextUrl.searchParams.get('due_for_refresh_only') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sources = await listKnowledgeSources({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      teamId: parsed.data.teamId,
      sourceType: parsed.data.sourceType,
      status: parsed.data.status,
      includeArchived: parsed.data.includeArchived,
      dueForRefreshOnly: parsed.data.dueForRefreshOnly,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ sources })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/sources', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge sources' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createKnowledgeSourceSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const source = await createKnowledgeSource({
      type: body.type,
      id: body.source_ref ?? undefined,
      orgId: body.org_id,
      projectId: body.scope_type === 'project' || body.scope_type === 'team' || body.scope_type === 'agent' ? body.project_id ?? null : null,
      teamId: body.scope_type === 'team' ? body.team_id ?? null : null,
      assistantId: body.scope_type === 'agent' ? body.assistant_id ?? null : null,
      url: body.url ?? null,
      label: body.label,
      visibility: body.visibility ?? (body.scope_type === 'workspace' ? 'org' : body.scope_type === 'agent' ? 'private' : body.scope_type),
      trustLevel: body.trust_level ?? 'observed',
      federationPolicy: body.federation_policy ?? 'source_scoped',
      retentionPolicy: body.retention_policy ?? 'standard',
      refreshPolicy: body.refresh_policy ?? (body.type === 'url' || body.type === 'repo' || body.type === 'file' ? 'on_change' : 'manual'),
    })

    if (!source) return NextResponse.json({ error: 'Failed to create source' }, { status: 500 })
    return NextResponse.json({ source }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/sources', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to create knowledge source' }, { status: 500 })
  }
})
