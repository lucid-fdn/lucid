import { createAgentCommerceClientFromEnv, type AgentCommerceClient } from './client.js'

export interface AgentCommerceToolContext {
  client?: AgentCommerceClient
  orgId: string
  assistantId: string
  runId?: string
  toolCallId?: string
}

export function resolveAgentCommerceClient(ctx: AgentCommerceToolContext): AgentCommerceClient | null {
  return ctx.client ?? createAgentCommerceClientFromEnv()
}
