import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getAgentOpsBrowserProcedureDetail,
  isUserOrgMember,
  recordAgentOpsBrowserProcedureRun,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const recordRunBodySchema = z.object({
  org_id: z.string().uuid(),
  version_id: z.string().uuid().nullable().optional(),
  ops_run_id: z.string().uuid(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'blocked', 'handoff_required']).optional(),
  matched_trigger: z.string().max(160).nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  security_flags: z.array(z.unknown()).optional(),
  output_summary: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

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

    const body = recordRunBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const detail = await getAgentOpsBrowserProcedureDetail({ orgId: body.org_id, procedureId: id })
    if (!detail) {
      return NextResponse.json({ error: 'Browser procedure not found' }, { status: 404 })
    }

    const procedureRun = await recordAgentOpsBrowserProcedureRun({
      procedureId: id,
      versionId: body.version_id ?? null,
      opsRunId: body.ops_run_id,
      status: body.status,
      matchedTrigger: body.matched_trigger ?? null,
      durationMs: body.duration_ms ?? null,
      securityFlags: body.security_flags,
      outputSummary: body.output_summary,
      metadata: {
        ...(body.metadata ?? {}),
        recorded_by: userId,
        execution_phase: 'registry_only',
      },
    })

    return NextResponse.json({ procedureRun }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-procedures/[id]/runs', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to record browser procedure run' }, { status: 500 })
  }
})
