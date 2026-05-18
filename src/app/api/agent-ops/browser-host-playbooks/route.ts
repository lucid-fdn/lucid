import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES } from '@/lib/agent-ops/browser-host-playbooks'
import {
  createAgentOpsBrowserHostPlaybook,
  isUserOrgMember,
  listAgentOpsBrowserHostPlaybooks,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  host: z.string().min(1).max(255).optional(),
  trustStates: z.array(z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES)).optional(),
  limit: z.number().int().positive().max(200).optional(),
})

const createPlaybookBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  host_pattern: z.string().min(1).max(255),
  title: z.string().min(1).max(160),
  body_md: z.string().min(1).max(12000),
  scope: z.enum(['project', 'org', 'global_catalog']).optional(),
  trust_state: z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES).optional(),
  source_run_id: z.string().uuid().nullable().optional(),
  created_by_agent_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
      projectId: parseNullableParam(req.nextUrl.searchParams.get('project_id')),
      host: req.nextUrl.searchParams.get('host') ?? undefined,
      trustStates: parseCsvEnum(req.nextUrl.searchParams.get('trust_states')),
      limit: parseLimit(req.nextUrl.searchParams.get('limit')),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const playbooks = await listAgentOpsBrowserHostPlaybooks({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      host: parsed.data.host,
      trustStates: parsed.data.trustStates,
      limit: parsed.data.limit ?? 50,
    })

    return NextResponse.json({ playbooks })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-host-playbooks', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list browser host playbooks' }, { status: 500 })
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

    const body = createPlaybookBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const playbook = await createAgentOpsBrowserHostPlaybook({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      hostPattern: body.host_pattern,
      title: body.title,
      bodyMd: body.body_md,
      scope: body.scope ?? (body.project_id ? 'project' : 'org'),
      trustState: body.trust_state ?? 'quarantined',
      sourceRunId: body.source_run_id ?? null,
      createdByUserId: userId,
      createdByAgentId: body.created_by_agent_id ?? null,
      metadata: body.metadata ?? {},
    })

    return NextResponse.json({ playbook }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-host-playbooks', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create browser host playbook' }, { status: 500 })
  }
})

function parseNullableParam(value: string | null): string | null | undefined {
  if (value === null) return undefined
  if (value === 'null' || value === '') return null
  return value
}

function parseCsvEnum(value: string | null): string[] | undefined {
  if (!value) return undefined
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}
