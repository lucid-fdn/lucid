import { describe, expect, it } from 'vitest'
import type { AgentCard } from '@contracts/lucid-card'
import { renderAgentCardIdentityDocuments } from '../agent-card-renderer'
import { validateAgentCard } from '../agent-card-validator'

const card: AgentCard = {
  schema_version: '1.0',
  kind: 'agent_card',
  metadata: { source: 'lucid' },
  profile: { name: 'Lucid Agent', bio: ['Build with receipts.'], lore: [], adjectives: ['careful'], topics: ['ops'] },
  voice: { summary: 'Calm and exact.', allowed_phrases: [], banned_phrases: [] },
  style: { all: ['Use short next steps.'], chat: [], post: [] },
  examples: { message_examples: [], post_examples: [] },
  guardrails: { always: ['Cite evidence.'], never: ['Invent results.'], escalation_rules: [] },
  knowledge: { snippets: ['Known fact.'], source_refs: [] },
  policies: { access_policy: { approvals: true } },
  modes: [],
}

describe('Agent Card renderer', () => {
  it('renders versionable identity documents with prompt summaries', () => {
    const docs = renderAgentCardIdentityDocuments(card)
    expect(docs.map((doc) => doc.document_type)).toContain('SOUL')
    expect(docs.find((doc) => doc.document_type === 'SOUL')?.content.source).toBe('agent_card')
    expect(docs.find((doc) => doc.document_type === 'SOUL')?.promptSection).toContain('## Persona')
    expect(docs.find((doc) => doc.document_type === 'SOUL')?.promptSection).not.toContain('"profile"')
  })

  it('validates required fields and prompt budget', () => {
    expect(validateAgentCard(card)).toMatchObject({ status: 'pass' })
    expect(validateAgentCard({ ...card, profile: { ...card.profile, name: '' } })).toMatchObject({ status: 'fail' })
  })
})
