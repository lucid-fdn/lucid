import { describe, expect, it } from 'vitest'
import { buildLucidCardExport, normalizeAgentCard } from '../card-core'
import { parseNativeLucidAgentCardImport } from '../card-import-core'

describe('Lucid Card core', () => {
  it('normalizes native Agent Card payloads without foreign branding', () => {
    const card = normalizeAgentCard({
      kind: 'agent_card',
      profile: { name: 'Agent', bio: ['A'], adjectives: ['careful'] },
      guardrails: { never: ['guess'] },
    })

    expect(card.kind).toBe('agent_card')
    expect(card.metadata.source).toBe('lucid')
    expect(card.profile.name).toBe('Agent')
    expect(card.profile.bio).toEqual(['A'])
  })

  it('parses wrapped imports and exports stable hashes', () => {
    const { card, warnings } = parseNativeLucidAgentCardImport({ card: { profile: { name: 'Wrapped' } } })
    const exported = buildLucidCardExport(card, { includeHash: true }) as { card_hash?: string }
    expect(card.profile.name).toBe('Wrapped')
    expect(warnings).toEqual(expect.arrayContaining(['Payload was normalized into a native Lucid Agent Card.']))
    expect(exported.card_hash).toMatch(/^[a-f0-9]{8}$/)
  })
})
