import { NextRequest, NextResponse } from 'next/server'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_PREFLIGHT_TARGETS,
  buildAgentOpsQualityGatePackReport,
  renderAgentOpsQualityGatePackMarkdown,
  type AgentOpsProductionPreflightTarget,
} from '@/lib/agent-ops'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

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

    const targetParam = req.nextUrl.searchParams.get('target')
    if (targetParam && !isTarget(targetParam)) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
    }
    const target = targetParam ? targetParam as AgentOpsProductionPreflightTarget : undefined

    const report = buildAgentOpsQualityGatePackReport({
      target,
      includeLiveChecks: readBooleanParam(req, 'live', false),
      includeWorkerChecks: readBooleanParam(req, 'worker', true),
      includeDiffHygiene: readBooleanParam(req, 'diff', true),
      includeRegistrySmoke: readBooleanParam(req, 'registrySmoke', true),
    })

    if (req.nextUrl.searchParams.get('format') === 'markdown') {
      return new NextResponse(renderAgentOpsQualityGatePackMarkdown(report), {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'x-lucid-agent-ops-quality-gates': report.target,
        },
      })
    }

    return NextResponse.json({ report })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/quality-gates', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to build Agent Ops quality gate report' }, { status: 500 })
  }
}

function readBooleanParam(req: NextRequest, key: string, fallback: boolean): boolean {
  const value = req.nextUrl.searchParams.get(key)
  if (value === null) return fallback
  return value === '1' || value === 'true'
}

function isTarget(value: string): value is AgentOpsProductionPreflightTarget {
  return AGENT_OPS_PREFLIGHT_TARGETS.includes(value as AgentOpsProductionPreflightTarget)
}
