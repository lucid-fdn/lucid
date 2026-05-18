import {
  matchNamedAgentBinding as matchNamedAgentBindingCore,
  resolveAgentTarget as resolveAgentTargetCore,
  type AgentTargetResolution,
  type NamedAgentMatch,
} from '@lucid/agent-routing'

export interface NamedAgentBinding {
  id: string
  assistantId: string
  assistantName: string
  aliases?: string[] | null
}

export interface ResolvableAgentBinding extends NamedAgentBinding {
  assistantId: string
}

export function matchNamedAgentBinding<T extends NamedAgentBinding>(
  bindings: T[],
  requestedName: string,
): NamedAgentMatch<T> {
  return matchNamedAgentBindingCore(bindings, requestedName, (binding) => ({
    id: binding.id,
    assistantId: binding.assistantId,
    assistantName: binding.assistantName,
    aliases: binding.aliases,
  }))
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
      assistantId: binding.assistantId,
      assistantName: binding.assistantName,
      aliases: binding.aliases,
    }),
  })
}
