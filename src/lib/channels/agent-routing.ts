import {
  matchNamedAgentBinding as matchNamedAgentBindingCore,
  resolveConversationBinding as resolveConversationBindingCore,
  type ConversationBindingResolution,
  type NamedAgentMatch,
} from '@lucid/agent-routing'

export interface NamedAgentBinding {
  id: string
  assistant_id: string
  assistant_name: string
  is_primary?: boolean
  aliases?: string[] | null
}

export function resolveConversationBinding<T extends { id: string; assistant_id: string }>(
  primary: T | null,
  bindings: T[],
): ConversationBindingResolution<T> {
  return resolveConversationBindingCore(primary, bindings)
}

export function matchNamedAgentBinding<T extends NamedAgentBinding>(
  bindings: T[],
  requestedName: string,
): NamedAgentMatch<T> {
  return matchNamedAgentBindingCore(bindings, requestedName, (binding) => ({
    id: binding.id,
    assistantId: binding.assistant_id,
    assistantName: binding.assistant_name,
    aliases: binding.aliases,
  }))
}
