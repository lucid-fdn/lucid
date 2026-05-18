import type { AgentCard } from '@contracts/lucid-card'

type AssistantFallback = { name?: string | null; description?: string | null }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function conversationExamples(value: unknown): AgentCard['examples']['message_examples'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    const messages: AgentCard['examples']['message_examples'][number]['messages'] = Array.isArray(record.messages) ? record.messages.flatMap((message) => {
      const row = asRecord(message)
      const role: 'user' | 'assistant' | null = row.role === 'user' || row.role === 'assistant' ? row.role : null
      const content = stringValue(row.content)
      return role && content ? [{ role, content }] : []
    }) : []
    return messages.length >= 2 ? [{ label: stringValue(record.label), messages }] : []
  })
}

function knowledgeRefs(value: unknown): AgentCard['knowledge']['source_refs'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    const type = ['knowledge_page', 'knowledge_source', 'memory', 'doc'].includes(String(record.type)) ? record.type as 'knowledge_page' | 'knowledge_source' | 'memory' | 'doc' : 'memory'
    const ref = stringValue(record.ref)
    return ref ? [{ type, ref, label: stringValue(record.label), provenance: stringValue(record.provenance) }] : []
  })
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashLucidCard(value: unknown): string {
  let hash = 2166136261
  const input = stableStringify(value)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function normalizeAgentCard(value: unknown, fallback: AssistantFallback = {}): AgentCard {
  const root = asRecord(value)
  const metadata = asRecord(root.metadata)
  const profile = asRecord(root.profile)
  const voice = asRecord(root.voice)
  const style = asRecord(root.style)
  const examples = asRecord(root.examples)
  const guardrails = asRecord(root.guardrails)
  const knowledge = asRecord(root.knowledge)
  const policies = asRecord(root.policies)

  return {
    schema_version: '1.0',
    kind: 'agent_card',
    metadata: {
      ...metadata,
      source: 'lucid',
      version: typeof metadata.version === 'number' ? metadata.version : 1,
      source_hash: stringValue(metadata.source_hash),
    },
    profile: {
      name: stringValue(profile.name) ?? fallback.name ?? 'Untitled Agent',
      username: stringValue(profile.username),
      description: stringValue(profile.description) ?? fallback.description ?? undefined,
      bio: stringArray(profile.bio),
      lore: stringArray(profile.lore),
      adjectives: stringArray(profile.adjectives),
      topics: stringArray(profile.topics),
    },
    voice: {
      summary: stringValue(voice.summary),
      formality: ['casual', 'neutral', 'professional', 'formal'].includes(String(voice.formality)) ? voice.formality as AgentCard['voice']['formality'] : undefined,
      warmth: ['low', 'medium', 'high'].includes(String(voice.warmth)) ? voice.warmth as AgentCard['voice']['warmth'] : undefined,
      humor: ['none', 'light', 'high'].includes(String(voice.humor)) ? voice.humor as AgentCard['voice']['humor'] : undefined,
      verbosity: ['concise', 'balanced', 'detailed'].includes(String(voice.verbosity)) ? voice.verbosity as AgentCard['voice']['verbosity'] : undefined,
      allowed_phrases: stringArray(voice.allowed_phrases),
      banned_phrases: stringArray(voice.banned_phrases),
    },
    style: {
      all: stringArray(style.all),
      chat: stringArray(style.chat),
      post: stringArray(style.post),
    },
    examples: {
      message_examples: conversationExamples(examples.message_examples),
      post_examples: stringArray(examples.post_examples),
    },
    guardrails: {
      always: stringArray(guardrails.always),
      never: stringArray(guardrails.never),
      refusal_style: stringValue(guardrails.refusal_style),
      escalation_rules: stringArray(guardrails.escalation_rules),
    },
    knowledge: {
      snippets: stringArray(knowledge.snippets),
      source_refs: knowledgeRefs(knowledge.source_refs),
    },
    policies: {
      memory_policy: recordValue(policies.memory_policy),
      access_policy: recordValue(policies.access_policy),
      tool_policy: recordValue(policies.tool_policy),
    },
    modes: Array.isArray(root.modes) ? root.modes.flatMap((mode) => {
      const record = recordValue(mode)
      return record ? [record] : []
    }) : [],
  }
}

export function buildLucidCardExport(card: AgentCard, options: { includeHash?: boolean } = {}) {
  const exported = normalizeAgentCard({
    ...card,
    metadata: {
      ...card.metadata,
      exported_at: new Date().toISOString(),
    },
  })

  if (!options.includeHash) return exported
  return {
    ...exported,
    card_hash: hashLucidCard({ ...exported, card_hash: undefined }),
  }
}
