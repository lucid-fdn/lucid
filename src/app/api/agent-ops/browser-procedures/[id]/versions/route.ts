import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS,
  AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS,
} from '@/lib/agent-ops/browser-procedures'
import {
  createAgentOpsBrowserProcedureVersion,
  getAgentOpsBrowserProcedureDetail,
  isUserOrgMember,
  listAgentOpsBrowserProcedureVersions,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
})

const createVersionBodySchema = z.object({
  org_id: z.string().uuid(),
  version: z.number().int().positive().optional(),
  definition_kind: z.enum(AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS).optional(),
  definition: z.record(z.string(), z.unknown()),
  fixture_artifact_id: z.string().uuid().nullable().optional(),
  test_definition: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1).max(160)).optional(),
  risk_level: z.enum(AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS).optional(),
  approval_policy: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({ orgId: req.nextUrl.searchParams.get('org_id') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const detail = await getAgentOpsBrowserProcedureDetail({ orgId: parsed.data.orgId, procedureId: id })
    if (!detail) {
      return NextResponse.json({ error: 'Browser procedure not found' }, { status: 404 })
    }

    const versions = await listAgentOpsBrowserProcedureVersions({ procedureId: id })
    return NextResponse.json({ versions })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-procedures/[id]/versions', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list browser procedure versions' }, { status: 500 })
  }
}

export const POST = withCSRF(async (
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = createVersionBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const detail = await getAgentOpsBrowserProcedureDetail({ orgId: body.org_id, procedureId: id })
    if (!detail) {
      return NextResponse.json({ error: 'Browser procedure not found' }, { status: 404 })
    }

    const version = await createAgentOpsBrowserProcedureVersion({
      procedureId: id,
      version: body.version,
      definitionKind: body.definition_kind,
      definition: body.definition,
      fixtureArtifactId: body.fixture_artifact_id ?? null,
      testDefinition: body.test_definition ?? {},
      capabilities: body.capabilities,
      riskLevel: body.risk_level,
      approvalPolicy: body.approval_policy ?? {},
      createdByUserId: userId,
    })

    return NextResponse.json({ version }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-procedures/[id]/versions', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create browser procedure version' }, { status: 500 })
  }
})
