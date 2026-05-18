import 'server-only'

import type { ModelMessage } from 'ai'
import { generateText } from '@/lib/ai/gateway'
import { getAssistant } from '@/lib/db'
import { AppServiceError } from './errors'

export interface RuntimeExecutorAppContext {
  id: string
  org_id: string
  project_id: string
  generation_run_id: string | null
  name: string
  slug: string
  assistant_ids?: string[] | null
}

export interface RuntimeExecutorContext {
  app: RuntimeExecutorAppContext
  manifest: Record<string, unknown>
  capabilities: string[]
}

export interface RuntimeExecutorChatInput {
  assistantId: string
  messages: ModelMessage[]
  visitorSessionId?: string
  agentopsTraceId: string
}

export interface RuntimeExecutorChatResult {
  text: string
  model: string
  estimatedCostCents: number
}

export interface RuntimeExecutorActionInput {
  action: string
  input: Record<string, unknown>
  idempotencyKey?: string
  visitorSessionId?: string
}

export interface RuntimeExecutorActionResult {
  status: 'accepted' | 'completed' | 'queued' | 'setup_required'
  runId?: string
  result?: unknown
}

export interface AppRuntimeExecutor {
  key: string
  respondToChat(context: RuntimeExecutorContext, input: RuntimeExecutorChatInput): Promise<RuntimeExecutorChatResult>
  runAction(context: RuntimeExecutorContext, input: RuntimeExecutorActionInput): Promise<RuntimeExecutorActionResult>
}

function manifestRuntimeMode(manifest: Record<string, unknown>): string | null {
  const runtime = manifest.runtime
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) return null
  const mode = (runtime as Record<string, unknown>).executor
    ?? (runtime as Record<string, unknown>).execution_mode
  return typeof mode === 'string' && mode.trim() ? mode.trim() : null
}

function mockReply(context: RuntimeExecutorContext, input: RuntimeExecutorChatInput): string {
  const lastUser = [...input.messages].reverse().find((message) => message.role === 'user')
  const content = typeof lastUser?.content === 'string' ? lastUser.content : 'your request'
  return `${context.app.name} is in mock runtime mode. Received: ${content}`
}

const mockRuntimeExecutor: AppRuntimeExecutor = {
  key: 'mock',
  async respondToChat(context, input) {
    return {
      text: mockReply(context, input),
      model: 'mock',
      estimatedCostCents: 0,
    }
  },
  async runAction(_context, input) {
    return {
      status: 'completed',
      runId: crypto.randomUUID(),
      result: {
        action: input.action,
        mode: 'mock',
        accepted: true,
      },
    }
  },
}

const lucidAgentRuntimeExecutor: AppRuntimeExecutor = {
  key: 'lucid_agent',
  async respondToChat(context, input) {
    const assistant = await getAssistant(input.assistantId)
    if (!assistant || assistant.org_id !== context.app.org_id) {
      throw new AppServiceError('setup_required', 'Generated app assistant is not available.', 409)
    }

    const result = await generateText({
      model: assistant.lucid_model ?? 'gpt-4.1-mini',
      system: assistant.system_prompt ?? `You are ${assistant.name}, the AI service behind ${context.app.name}.`,
      temperature: typeof assistant.temperature === 'number' ? assistant.temperature : undefined,
      maxTokens: typeof assistant.max_tokens === 'number' ? assistant.max_tokens : undefined,
      messages: input.messages,
    })

    return {
      text: result.text.trim(),
      model: assistant.lucid_model ?? 'gpt-4.1-mini',
      estimatedCostCents: 1,
    }
  },
  async runAction() {
    return { status: 'setup_required' }
  },
}

export function selectAppRuntimeExecutor(
  context: RuntimeExecutorContext,
  env: Record<string, string | undefined> = process.env,
): AppRuntimeExecutor {
  const mode = manifestRuntimeMode(context.manifest)
    ?? env.APP_SERVICE_RUNTIME_EXECUTOR_MODE
    ?? 'lucid_agent'

  if (mode === 'mock') return mockRuntimeExecutor
  return lucidAgentRuntimeExecutor
}

export async function executePublicRuntimeChat(
  context: RuntimeExecutorContext,
  input: RuntimeExecutorChatInput,
): Promise<RuntimeExecutorChatResult> {
  return selectAppRuntimeExecutor(context).respondToChat(context, input)
}

export async function executePublicRuntimeAction(
  context: RuntimeExecutorContext,
  input: RuntimeExecutorActionInput,
): Promise<RuntimeExecutorActionResult> {
  return selectAppRuntimeExecutor(context).runAction(context, input)
}
