import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  isUserOrgMember,
  listAgentOpsSecurityAttempts,
  recordAgentOpsSecurityAttempt,
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

const createAttemptBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  ops_run_id: z.string().uuid().nullable().optional(),
  source_kind: z.enum([
    'channel_message',
    'attachment',
    'browser_output',
    'memory_snippet',
    'tool_output',
    'web_fetch',
    'repo_diff',
    'user_input',
    'project_learning',
    'agent_ops_api',
    'canary_leak',
    'model_classifier',
  ]),
  source_ref: z.string().max(1000).nullable().optional(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(2000),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const attempts = await listAgentOpsSecurityAttempts(parsed.data)
    return NextResponse.json({ attempts })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/security-attempts', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list security attempts' }, { status: 500 })
  }
}

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

    const body = createAttemptBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const attempt = await recordAgentOpsSecurityAttempt({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      assistantId: body.assistant_id ?? null,
      opsRunId: body.ops_run_id ?? null,
      sourceKind: body.source_kind,
      sourceRef: body.source_ref ?? null,
      severity: body.severity,
      title: body.title,
      body: body.body,
      metadata: { ...body.metadata, recorded_by: userId },
    })

    return NextResponse.json({ attempt }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/security-attempts', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to record security attempt' }, { status: 500 })
  }
})
