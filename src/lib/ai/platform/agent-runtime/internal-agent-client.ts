import 'server-only'

import { getWorkerUrl } from '@/lib/worker/config'

const nativeFetch =
  process.env.NODE_ENV === 'development'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('undici').fetch as typeof globalThis.fetch)
    : globalThis.fetch

export interface InternalAgentRunInput {
  agent: {
    id?: string
    name: string
    engine?: 'openclaw' | 'hermes'
    systemPrompt: string
    soulContent?: string
    model: string
    temperature?: number
    maxTokens?: number
    orgId?: string
    userId?: string
    memoryEnabled?: boolean
  }
  input: {
    message: string
    messages?: Array<{
      role: string
      content: string
    }>
    memories?: string[]
    conversationId?: string
  }
  budget?: {
    maxLlmCalls?: number
    maxToolCalls?: number
    maxWallTimeMs?: number
    maxOutputTokens?: number
  }
  policy?: {
    allowBuiltInSkills?: boolean
    allowedTools?: string[]
  }
}

export interface InternalAgentRunResult {
  text: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
  steps: number
  toolCallsUsed: number
  budgetExhausted: boolean
  hasProviderError: boolean
}

export async function runInternalWorkerAgent(
  input: InternalAgentRunInput,
): Promise<InternalAgentRunResult> {
  const workerUrl = getWorkerUrl()
  if (!workerUrl) {
    throw new Error('WORKER_URL not configured')
  }

  const response = await nativeFetch(`${workerUrl}/internal/agents/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.WORKER_TRIGGER_SECRET
        ? { Authorization: `Bearer ${process.env.WORKER_TRIGGER_SECRET}` }
        : {}),
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Internal worker agent failed (${response.status}): ${body.slice(0, 200)}`)
  }

  return response.json() as Promise<InternalAgentRunResult>
}
