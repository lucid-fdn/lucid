import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_DECISION_DOOR_TYPES,
  AGENT_OPS_DECISION_MODES,
  AGENT_OPS_DECISION_PHASES,
} from '@/lib/agent-ops/decision-pacing'
import {
  isUserOrgMember,
  listAgentOpsDecisionEvents,
  recordAgentOpsDecisionEvent,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const jsonObjectSchema = z.record(z.string(), z.unknown())

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  decisionMode: z.enum(AGENT_OPS_DECISION_MODES).optional(),
})

const decisionOptionSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(240),
  description: z.string().max(1000).default(''),
  reversible: z.boolean().default(true),
})

const recordDecisionEventBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  phase: z.enum(AGENT_OPS_DECISION_PHASES),
  question_id: z.string().min(1).max(160),
  door_type: z.enum(AGENT_OPS_DECISION_DOOR_TYPES),
  decision_mode: z.enum(AGENT_OPS_DECISION_MODES),
  question: z.string().min(1).max(1000),
  options: z.array(decisionOptionSchema).default([]),
  selected_option: jsonObjectSchema.nullable().optional(),
  risk_reason: z.string().max(1000).nullable().optional(),
  reversible: z.boolean().default(true),
  flipped_from_event_id: z.string().uuid().nullable().optional(),
  metadata: jsonObjectSchema.default({}),
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
      runId: req.nextUrl.searchParams.get('run_id') ?? undefined,
      decisionMode: req.nextUrl.searchParams.get('decision_mode') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const events = await listAgentOpsDecisionEvents({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      runId: parsed.data.runId,
      decisionMode: parsed.data.decisionMode,
      limit: 100,
    })
    return NextResponse.json({ events })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/decision-events', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list decision events' }, { status: 500 })
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

    const body = recordDecisionEventBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const event = await recordAgentOpsDecisionEvent({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      runId: body.run_id ?? null,
      phase: body.phase,
      questionId: body.question_id,
      doorType: body.door_type,
      decisionMode: body.door_type === 'one_way' && body.decision_mode === 'silent_decision'
        ? 'asked'
        : body.decision_mode,
      question: body.question,
      options: body.options,
      selectedOption: body.selected_option ?? null,
      riskReason: body.risk_reason ?? null,
      reversible: body.door_type === 'one_way' ? false : body.reversible,
      flippedFromEventId: body.flipped_from_event_id ?? null,
      metadata: body.metadata,
      createdByUserId: userId,
    })
    if (!event) {
      return NextResponse.json({ error: 'Failed to record decision event' }, { status: 500 })
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/decision-events', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to record decision event' }, { status: 500 })
  }
})
