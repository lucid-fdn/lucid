import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  PROJECT_LEARNING_TRUST_LEVELS,
  PROJECT_LEARNING_TYPES,
  projectLearningInputSchema,
} from '@/lib/agent-ops/project-learnings'
import {
  createProjectLearning,
  isUserOrgMember,
  listProjectLearnings,
  recordAgentOpsSecurityAttempt,
  updateProjectLearning,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const createLearningBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  ops_run_id: z.string().uuid().nullable().optional(),
  learning_type: z.enum(PROJECT_LEARNING_TYPES),
  trust_level: z.enum(PROJECT_LEARNING_TRUST_LEVELS).optional(),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(4000),
  source_kind: z.enum(['agent_ops_run', 'manual', 'channel', 'repo', 'deploy', 'incident', 'memory']).optional(),
  source_ref: z.string().max(1000).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

const updateLearningBodySchema = z.object({
  org_id: z.string().uuid(),
  learning_id: z.string().uuid(),
  action: z.enum(['archive', 'reject', 'promote']),
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
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const learnings = await listProjectLearnings({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      assistantId: parsed.data.assistantId,
      limit: parsed.data.limit,
    })

    return NextResponse.json({ learnings })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/learnings', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list project learnings' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  let rawBody: z.infer<typeof createLearningBodySchema> | null = null
  let userId: string | null = null
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    rawBody = createLearningBodySchema.parse(await req.json())
    const body = projectLearningInputSchema.parse({
      orgId: rawBody.org_id,
      projectId: rawBody.project_id ?? null,
      assistantId: rawBody.assistant_id ?? null,
      opsRunId: rawBody.ops_run_id ?? null,
      type: rawBody.learning_type,
      trustLevel: rawBody.trust_level,
      title: rawBody.title,
      body: rawBody.body,
      sourceKind: rawBody.source_kind,
      sourceRef: rawBody.source_ref,
      confidence: rawBody.confidence,
      metadata: rawBody.metadata,
      createdBy: userId,
    })

    const isMember = await isUserOrgMember(userId, body.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const learning = await createProjectLearning(body)
    return NextResponse.json({ learning }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Instruction-like project learnings require')) {
      if (rawBody && userId) {
        await recordAgentOpsSecurityAttempt({
          orgId: rawBody.org_id,
          projectId: rawBody.project_id ?? null,
          assistantId: rawBody.assistant_id ?? null,
          opsRunId: rawBody.ops_run_id ?? null,
          sourceKind: 'project_learning',
          sourceRef: rawBody.source_ref ?? null,
          severity: 'high',
          title: 'Rejected instruction-like project learning',
          body: rawBody.title,
          metadata: {
            source_kind: rawBody.source_kind ?? 'agent_ops_run',
            recorded_by: userId,
          },
        }).catch(() => {})
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/learnings', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create project learning' }, { status: 500 })
  }
})

export const PATCH = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = updateLearningBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const learning = await updateProjectLearning({
      orgId: body.org_id,
      learningId: body.learning_id,
      status: body.action === 'archive' ? 'archived' : body.action === 'reject' ? 'rejected' : 'active',
      trustLevel: body.action === 'promote' ? 'operator_approved' : undefined,
      confidence: body.action === 'promote' ? 1 : undefined,
    })

    return NextResponse.json({ learning })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/learnings', method: 'PATCH' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update project learning' }, { status: 500 })
  }
})
