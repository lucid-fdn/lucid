import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  KnowledgeImportModeSchema,
  KnowledgeImportSourceTypeSchema,
  KnowledgeImportStatusSchema,
} from '@contracts/knowledge-imports'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { createKnowledgeImportJob, listKnowledgeImportJobs } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const listImportsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  status: KnowledgeImportStatusSchema.optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const createImportBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  source_type: KnowledgeImportSourceTypeSchema,
  mode: KnowledgeImportModeSchema.default('preview'),
  status: KnowledgeImportStatusSchema.default('queued'),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listImportsQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      team_id: req.nextUrl.searchParams.get('team_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const access = await resolveKnowledgeManagerAccess({ userId, orgId: parsed.data.org_id })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const jobs = await listKnowledgeImportJobs({
      orgId: parsed.data.org_id,
      projectId: parsed.data.project_id,
      teamId: parsed.data.team_id,
      status: parsed.data.status,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ jobs })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/imports', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-imports' },
    })
    return NextResponse.json({ error: 'Failed to list imports' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createImportBodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const job = await createKnowledgeImportJob({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      teamId: body.team_id ?? null,
      sourceType: body.source_type,
      mode: body.mode,
      status: body.status,
      metadata: body.metadata,
      createdByUserId: userId,
    })
    return NextResponse.json({ job }, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/imports', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-imports' },
    })
    return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
  }
})
