import type { AgentCard } from '@contracts/lucid-card'
import { normalizeAgentCard } from './card-core'

interface ImportFallback {
  name?: string | null
  description?: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function parseNativeLucidAgentCardImport(payload: unknown, fallback: ImportFallback = {}): {
  card: AgentCard
  warnings: string[]
} {
  const warnings: string[] = []
  const root = asRecord(payload)
  if (!root) {
    warnings.push('Import payload was not an object; a fallback Agent Card was created.')
    return { card: normalizeAgentCard({}, fallback), warnings }
  }

  const candidate = root.card && asRecord(root.card) ? root.card : root
  const candidateRecord = asRecord(candidate) ?? {}
  if (candidateRecord.kind !== 'agent_card') {
    warnings.push('Payload was normalized into a native Lucid Agent Card.')
  }

  return { card: normalizeAgentCard(candidateRecord, fallback), warnings }
}
