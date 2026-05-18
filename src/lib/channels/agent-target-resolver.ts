import {
  resolveAgentTarget as resolveAgentTargetCore,
  type AgentTargetResolution,
} from '@lucid/agent-routing'
import type { NamedAgentBinding } from './agent-routing'

export interface ResolvableAgentBinding extends NamedAgentBinding {
  assistant_id: string
}

export function resolveAgentTarget<T extends ResolvableAgentBinding>(params: {
  bindings: T[]
  explicitTarget?: string | null
  conversationDefault?: T | null
  surfaceDefault?: T | null
}): AgentTargetResolution<T> {
  return resolveAgentTargetCore({
    ...params,
    toCanonical: (binding) => ({
      id: binding.id,
      assistantId: binding.assistant_id,
      assistantName: binding.assistant_name,
      aliases: binding.aliases,
    }),
  })
}
