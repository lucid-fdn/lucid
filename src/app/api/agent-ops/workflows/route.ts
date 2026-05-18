import { NextRequest, NextResponse } from 'next/server'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { buildAgentOpsWorkflowTeamOpsProjection, listAgentOpsWorkflows } from '@/lib/agent-ops'
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

    return NextResponse.json({
      workflows: listAgentOpsWorkflows().map((workflow) => ({
        id: workflow.id,
        slug: workflow.slug,
        version: workflow.version,
        name: workflow.name,
        description: workflow.description,
        promise: workflow.promise,
        triggerPhrases: workflow.triggerPhrases,
        defaultAgentRole: workflow.defaultAgentRole,
        executionMode: workflow.executionMode,
        safetyMode: workflow.safetyMode,
        requiredCapabilities: workflow.requiredCapabilities,
        compatibleRuntimeModes: workflow.compatibleRuntimeModes,
        capabilityFallbacks: workflow.capabilityFallbacks,
        inputFields: workflow.inputFields,
        outputSections: workflow.outputSections,
        evidenceTypes: workflow.evidenceTypes,
        approvalGates: workflow.approvalGates,
        evalPack: workflow.evalPack,
        teamOps: buildAgentOpsWorkflowTeamOpsProjection(workflow),
        metadata: workflow.metadata,
      })),
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/workflows', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list Agent Ops workflows' }, { status: 500 })
  }
}
