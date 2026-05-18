import type { TemplateLibraryItem } from '../library'
import {
  getBestFirstUtilities,
  getCompatibleTemplateSuggestions,
  getTemplateProductStory,
  normalizeCategory,
} from '../product-copy'

function item(input: Partial<TemplateLibraryItem> & Pick<TemplateLibraryItem, 'slug' | 'name' | 'type'>): TemplateLibraryItem {
  return {
    id: input.slug,
    description: input.description ?? null,
    category: input.category ?? 'web3-intelligence',
    source: input.source ?? 'platform',
    status: input.status ?? 'approved',
    version: input.version ?? '1.0.0',
    tags: input.tags ?? ['web3'],
    installCount: input.installCount ?? 0,
    previewPrompt: input.previewPrompt ?? null,
    backingKind: 'lucid_pack',
    action: input.type === 'capability' ? 'preview_install' : 'deploy',
    createdAt: input.createdAt ?? '2026-05-13T00:00:00Z',
    updatedAt: input.updatedAt ?? '2026-05-13T00:00:00Z',
    pack: {
      id: input.slug,
      orgId: null,
      packKey: input.slug,
      name: input.name,
      description: input.description ?? null,
      version: '1.0.0',
      status: 'active',
      createdAt: '2026-05-13T00:00:00Z',
      updatedAt: '2026-05-13T00:00:00Z',
      manifest: {
        schema_version: '1.0',
        key: input.slug,
        name: input.name,
        version: '1.0.0',
        description: input.description ?? null,
        resources: [],
      },
    },
    ...input,
  } as TemplateLibraryItem
}

describe('template product copy', () => {
  it('prioritizes best first utility templates', () => {
    const items = [
      item({ slug: 'support-agent', name: 'Support Agent', type: 'agent', category: 'support' }),
      item({ slug: 'web3-whale-watchtower', name: 'Whale Watchtower', type: 'capability' }),
      item({ slug: 'web3-token-war-room', name: 'Token War Room', type: 'capability' }),
    ]

    expect(getBestFirstUtilities(items).map((candidate) => candidate.slug)).toEqual([
      'web3-whale-watchtower',
      'web3-token-war-room',
      'support-agent',
    ])
  })

  it('explains the whale tracking first utility with proof and prompts', () => {
    const story = getTemplateProductStory(item({
      slug: 'web3-whale-watchtower',
      name: 'Whale Watchtower',
      type: 'capability',
    }))

    expect(story.promise).toContain('important wallets move')
    expect(story.expectedOutput).toContain('wallet movements')
    expect(story.proof.join(' ')).toContain('Mission Control')
    expect(story.examplePrompts[0]).toContain('Track these wallets')
  })

  it('suggests compatible Web3 templates without exposing pack internals', () => {
    const current = item({ slug: 'web3-whale-watchtower', name: 'Whale Watchtower', type: 'capability' })
    const suggestions = getCompatibleTemplateSuggestions(current, [
      current,
      item({ slug: 'web3-token-war-room', name: 'Token War Room', type: 'capability' }),
      item({ slug: 'web3-portfolio-risk-agent', name: 'Portfolio Risk Agent', type: 'capability' }),
    ])

    expect(suggestions.map((suggestion) => suggestion.slug)).toEqual([
      'web3-token-war-room',
      'web3-portfolio-risk-agent',
    ])
    expect(suggestions[0]?.reason).toContain('token')
  })

  it('normalizes categories into user-facing filter groups', () => {
    expect(normalizeCategory('web3-intelligence')).toBe('web3')
    expect(normalizeCategory('Prospecting')).toBe('sales')
    expect(normalizeCategory('Customer Success')).toBe('support')
    expect(normalizeCategory('Executive Ops')).toBe('operations')
  })
})
