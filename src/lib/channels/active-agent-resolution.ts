import { resolveConversationBinding } from '@/lib/channels/agent-routing'

export type ActiveAgentResolution<T extends { id: string; assistant_id: string }> =
  | { kind: 'primary'; channel: { id: string; assistant_id: string } }
  | { kind: 'has_bindings_no_primary'; bindings: T[] }
  | { kind: 'no_bindings' }

export function resolveActiveAgentBinding<T extends { id: string; assistant_id: string }>(
  primary: T | null,
  bindings: T[],
): ActiveAgentResolution<T> {
  const resolution = resolveConversationBinding(primary, bindings)
  if (resolution.kind === 'primary') {
    return {
      kind: 'primary',
      channel: {
        id: resolution.binding.id,
        assistant_id: resolution.binding.assistant_id,
      },
    }
  }
  if (resolution.kind === 'no_bindings') {
    return { kind: 'no_bindings' }
  }
  return {
    kind: 'has_bindings_no_primary',
    bindings: resolution.bindings,
  }
}
