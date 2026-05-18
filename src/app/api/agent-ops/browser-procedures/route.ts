import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS,
  AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS,
  AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES,
  AGENT_OPS_BROWSER_PROCEDURE_TYPES,
} from '@/lib/agent-ops/browser-procedures'
import {
  createAgentOpsBrowserProcedure,
  createAgentOpsBrowserProcedureVersion,
  findMatchingAgentOpsBrowserProcedures,
  isUserOrgMember,
  listAgentOpsBrowserProcedures,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  host: z.string().min(1).max(255).optional(),
  intent: z.string().min(1).max(500).optional(),
  trustStates: z.array(z.enum(AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES)).optional(),
  procedureTypes: z.array(z.enum(AGENT_OPS_BROWSER_PROCEDURE_TYPES)).optional(),
  limit: z.number().int().positive().max(200).optional(),
})

const createVersionBodySchema = z.object({
  definition_kind: z.enum(AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS).optional(),
  definition: z.record(z.string(), z.unknown()),
  fixture_artifact_id: z.string().uuid().nullable().optional(),
  test_definition: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1).max(160)).optional(),
  risk_level: z.enum(AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS).optional(),
  approval_policy: z.record(z.string(), z.unknown()).optional(),
})

const createProcedureBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  host_pattern: z.string().min(1).max(255),
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(2000),
  intent_triggers: z.array(z.string().min(1).max(160)).optional(),
  procedure_type: z.enum(AGENT_OPS_BROWSER_PROCEDURE_TYPES).optional(),
  scope: z.enum(['project', 'org', 'global_catalog']).optional(),
  trust_state: z.enum(AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES).optional(),
  source_run_id: z.string().uuid().nullable().optional(),
  created_by_agent_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  initial_version: createVersionBodySchema.optional(),
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
      intent: req.nextUrl.searchParams.get('intent') ?? undefined,
      trustStates: parseCsvEnum(req.nextUrl.searchParams.get('trust_states')),
      procedureTypes: parseCsvEnum(req.nextUrl.searchParams.get('procedure_types')),
      limit: parseLimit(req.nextUrl.searchParams.get('limit')),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (parsed.data.intent) {
      const matches = await findMatchingAgentOpsBrowserProcedures({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        host: parsed.data.host,
        intent: parsed.data.intent,
        trustStates: parsed.data.trustStates,
        procedureTypes: parsed.data.procedureTypes,
        limit: parsed.data.limit ?? 50,
      })
      return NextResponse.json({ matches })
    }

    const procedures = await listAgentOpsBrowserProcedures({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      host: parsed.data.host,
      trustStates: parsed.data.trustStates,
      procedureTypes: parsed.data.procedureTypes,
      limit: parsed.data.limit ?? 50,
    })

    return NextResponse.json({ procedures })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-procedures', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list browser procedures' }, { status: 500 })
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

    const body = createProcedureBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const procedure = await createAgentOpsBrowserProcedure({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      hostPattern: body.host_pattern,
      name: body.name,
      slug: body.slug,
      description: body.description,
      intentTriggers: body.intent_triggers ?? [],
      procedureType: body.procedure_type,
      scope: body.scope ?? (body.project_id ? 'project' : 'org'),
      trustState: body.trust_state,
      sourceRunId: body.source_run_id ?? null,
      createdByUserId: userId,
      createdByAgentId: body.created_by_agent_id ?? null,
      metadata: body.metadata ?? {},
    })

    const version = body.initial_version
      ? await createAgentOpsBrowserProcedureVersion({
        procedureId: procedure.id,
        definitionKind: body.initial_version.definition_kind,
        definition: body.initial_version.definition,
        fixtureArtifactId: body.initial_version.fixture_artifact_id ?? null,
        testDefinition: body.initial_version.test_definition ?? {},
        capabilities: body.initial_version.capabilities,
        riskLevel: body.initial_version.risk_level,
        approvalPolicy: body.initial_version.approval_policy ?? {},
        createdByUserId: userId,
      })
      : null

    return NextResponse.json({ procedure, version }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-procedures', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create browser procedure' }, { status: 500 })
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
