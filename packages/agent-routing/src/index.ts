export interface CanonicalNamedAgentBinding {
  id: string
  assistantId: string
  assistantName: string
  aliases?: string[] | null
}

export type NamedAgentMatch<T> =
  | { kind: 'resolved'; binding: T }
  | { kind: 'ambiguous'; bindings: T[] }
  | { kind: 'not_found' }

export type ConversationBindingResolution<T> =
  | { kind: 'primary'; binding: T }
  | { kind: 'has_bindings_no_primary'; bindings: T[] }
  | { kind: 'no_bindings' }

export type AgentTargetResolution<T> =
  | { kind: 'resolved'; binding: T; source: 'explicit_target' | 'conversation_default' | 'surface_default' }
  | { kind: 'ambiguous'; bindings: T[]; source: 'explicit_target' }
  | {
      kind: 'unresolved'
      reason: 'explicit_target_not_found' | 'no_binding_available' | 'no_conversation_default'
      bindings?: T[]
    }

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function aliasTokens(binding: CanonicalNamedAgentBinding): string[] {
  return (binding.aliases ?? [])
    .map((alias) => (typeof alias === 'string' ? normalizeToken(alias) : ''))
    .filter((alias, index, all) => alias.length > 0 && all.indexOf(alias) === index)
}

function rankBindingMatch(binding: CanonicalNamedAgentBinding, target: string): number {
  const normalizedName = normalizeToken(binding.assistantName)
  const aliases = aliasTokens(binding)

  if (aliases.includes(target)) return 4
  if (normalizedName === target) return 3
  if (aliases.some((alias) => alias.startsWith(target))) return 2
  if (normalizedName.startsWith(target)) return 2
  if (aliases.some((alias) => alias.includes(target))) return 1
  if (normalizedName.includes(target)) return 1
  return 0
}

export function resolveConversationBinding<T extends { id: string }>(
  primary: T | null,
  bindings: T[],
): ConversationBindingResolution<T> {
  if (primary) {
    return { kind: 'primary', binding: primary }
  }

  if (bindings.length === 0) {
    return { kind: 'no_bindings' }
  }

  return { kind: 'has_bindings_no_primary', bindings }
}

export function matchNamedAgentBinding<T>(
  bindings: T[],
  requestedName: string,
  toCanonical: (binding: T) => CanonicalNamedAgentBinding,
): NamedAgentMatch<T> {
  const target = normalizeToken(requestedName)
  if (!target) return { kind: 'not_found' }

  let bestRank = 0
  let matches: T[] = []

  for (const binding of bindings) {
    const rank = rankBindingMatch(toCanonical(binding), target)
    if (rank === 0) continue
    if (rank > bestRank) {
      bestRank = rank
      matches = [binding]
      continue
    }
    if (rank === bestRank) {
      matches.push(binding)
    }
  }

  if (matches.length === 0) {
    return { kind: 'not_found' }
  }

  const deduped = matches.filter(
    (binding, index, all) =>
      all.findIndex((candidate) => toCanonical(candidate).id === toCanonical(binding).id) === index,
  )

  if (deduped.length === 1) {
    return { kind: 'resolved', binding: deduped[0] }
  }

  return { kind: 'ambiguous', bindings: deduped }
}

export function resolveAgentTarget<T>(params: {
  bindings: T[]
  explicitTarget?: string | null
  conversationDefault?: T | null
  surfaceDefault?: T | null
  toCanonical: (binding: T) => CanonicalNamedAgentBinding
}): AgentTargetResolution<T> {
  const explicitTarget = params.explicitTarget?.trim() ?? ''
  if (explicitTarget.length > 0) {
    const match = matchNamedAgentBinding(params.bindings, explicitTarget, params.toCanonical)
    if (match.kind === 'resolved') {
      return {
        kind: 'resolved',
        binding: match.binding,
        source: 'explicit_target',
      }
    }
    if (match.kind === 'ambiguous') {
      return {
        kind: 'ambiguous',
        bindings: match.bindings,
        source: 'explicit_target',
      }
    }
    return {
      kind: 'unresolved',
      reason: 'explicit_target_not_found',
      bindings: params.bindings,
    }
  }

  if (params.conversationDefault) {
    return {
      kind: 'resolved',
      binding: params.conversationDefault,
      source: 'conversation_default',
    }
  }

  if (params.surfaceDefault) {
    return {
      kind: 'resolved',
      binding: params.surfaceDefault,
      source: 'surface_default',
    }
  }

  if (params.bindings.length === 0) {
    return { kind: 'unresolved', reason: 'no_binding_available' }
  }

  return {
    kind: 'unresolved',
    reason: 'no_conversation_default',
    bindings: params.bindings,
  }
}
