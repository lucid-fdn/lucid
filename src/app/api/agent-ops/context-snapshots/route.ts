import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { AGENT_OPS_CONTEXT_SNAPSHOT_KINDS, contextSnapshotInputSchema } from '@/lib/agent-ops/operating-loop'
import {
  createAgentOpsContextSnapshot,
  isUserOrgMember,
  listAgentOpsContextSnapshots,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  opsRunId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(100).optional()),
})

const createSnapshotBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  ops_run_id: z.string().uuid().nullable().optional(),
  snapshot_kind: z.enum(AGENT_OPS_CONTEXT_SNAPSHOT_KINDS).optional(),
  title: z.string().min(1).max(240),
  summary: z.string().max(2000).nullable().optional(),
  state: z.record(z.string(), z.unknown()).optional().default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      assistantId: req.nextUrl.searchParams.get('assistant_id') ?? undefined,
      opsRunId: req.nextUrl.searchParams.get('ops_run_id') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const snapshots = await listAgentOpsContextSnapshots(parsed.data)
    return NextResponse.json({ snapshots })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/context-snapshots', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list context snapshots' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createSnapshotBodySchema.parse(await req.json())
    const input = contextSnapshotInputSchema.parse({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      assistantId: body.assistant_id ?? null,
      opsRunId: body.ops_run_id ?? null,
      kind: body.snapshot_kind,
      title: body.title,
      summary: body.summary,
      state: body.state,
      metadata: body.metadata,
      createdBy: userId,
    })

    const isMember = await isUserOrgMember(userId, input.orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const snapshot = await createAgentOpsContextSnapshot(input)
    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/context-snapshots', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create context snapshot' }, { status: 500 })
  }
})
