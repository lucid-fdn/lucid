import 'server-only'

import { proxyToWorkerStream } from '@/lib/ai/worker-proxy'
import type { AIGenerationAdapterOutput } from '../types'

type AgentRunInput = Parameters<typeof proxyToWorkerStream>[0] & {
  routeTargetHint?: string
}

export interface AgentRunGenerationOutput extends AIGenerationAdapterOutput {
  response: Response
  runId: string
}

export async function agentRunGenerationAdapter(
  input: AgentRunInput,
): Promise<AgentRunGenerationOutput> {
  const startedAt = Date.now()
  const response = await proxyToWorkerStream(input)
  const route = response.headers.get('x-lucid-route') ?? input.routeTargetHint

  return {
    response,
    runId: input.runId,
    provider: 'worker',
    model: input.assistantConfig.lucid_model ?? undefined,
    receipt: {
      provider: 'worker',
      model: input.assistantConfig.lucid_model ?? undefined,
      latencyMs: Date.now() - startedAt,
      requestId: input.runId,
      metadata: {
        route,
        assistantId: input.assistantId,
        conversationId: input.conversationId,
        status: response.status,
      },
    },
  }
}
