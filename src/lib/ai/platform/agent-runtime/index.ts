import 'server-only'

import { logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'
import { invokeBuilderAgentLocal } from './local-orchestrator'
import type {
  BuilderAgentInvocationInput,
  BuilderAgentInvocationResult,
  BuilderPlanningBackend,
} from './types'

function resolveBuilderPlanningBackend(): BuilderPlanningBackend {
  return process.env.LUCID_INTERNAL_BUILDER_BACKEND === 'worker-agent'
    ? 'worker-agent'
    : 'local-orchestrator'
}

export async function invokeBuilderAgent(
  input: BuilderAgentInvocationInput,
): Promise<BuilderAgentInvocationResult['result']> {
  const startedAt = Date.now()
  const planningBackend = resolveBuilderPlanningBackend()
  const invocation = await invokeBuilderAgentLocal({
    ...input,
    planningBackend,
  })

  logBuilderTelemetry('[builder:runtime]', {
    executionBackend: invocation.backend,
    planningBackend,
    duration_ms: Date.now() - startedAt,
  })

  return invocation.result
}

export type {
  BuilderAgentInvocationInput,
  BuilderAgentInvocationResult,
  BuilderPlanningBackend,
} from './types'
