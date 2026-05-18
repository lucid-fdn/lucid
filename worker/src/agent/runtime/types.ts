import type { ChannelOutput } from '../../channels/ChannelOutput.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantConfig, AgentMessage, RunBudget } from '../types.js'
import type { ActivatedPlugin } from '../plugin-types.js'

export interface AgentRuntime {
  runTurn(input: RunTurnInput): Promise<RunTurnOutput>
}

export interface RunTurnInput {
  orgId: string
  assistantId: string
  conversationId: string
  runId: string
  sessionKey?: string        // optional in embedded, required for gateway

  assistant: AssistantConfig
  plugins: ActivatedPlugin[]
  budget: RunBudget

  userMessage: string
  messages: AgentMessage[]
  memories: string[]
  images?: Array<{ data: string; mimeType: string }>

  output?: ChannelOutput

  supabase?: SupabaseClient
  userId?: string
  channelId?: string
  subagentDepth?: number

  embeddedConfig?: {
    llmConfig: { baseUrl: string; apiKey: string }
  }

  abortSignal?: AbortSignal
}

export interface RunTurnOutput {
  text: string
  toolCallsUsed: number
  meta: {
    durationMs: number
    model?: string
    usage?: { input?: number; output?: number; total?: number }
    stopReason?: string
    error?: { kind: string; message: string }
    capabilitySurface?: Record<string, unknown>
  }
}
