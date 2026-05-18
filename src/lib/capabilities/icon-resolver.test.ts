import { describe, expect, it } from 'vitest'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import {
  createCapabilityRegistryIndex,
  getTemplateCapabilityRefs,
  normalizeCapabilityIconSlug,
  resolveCapabilityIconItem,
  resolveCapabilityIconItems,
} from './icon-resolver'

function makeSkill(input: Partial<UnifiedSkillItem> & Pick<UnifiedSkillItem, 'id' | 'slug' | 'name'>): UnifiedSkillItem {
  return {
    description: null,
    category: 'productivity',
    item_type: 'skill',
    section: 'installed',
    installed: true,
    is_active: true,
    installation_id: null,
    activation_id: null,
    tools: null,
    enabled_tools: null,
    tool_count: 0,
    can_act: false,
    always_on: false,
    removable: true,
    connection_status: null,
    auth_provider: null,
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: null,
    version: '1',
    author: null,
    source: 'test',
    verified: true,
    source_type: null,
    support_level: 'native',
    capability_tier: null,
    trust_tier: null,
    warm_state: null,
    update_available: null,
    ...input,
  }
}

describe('capability icon resolver', () => {
  it('resolves registry items by slug, id, and prefixed slug', () => {
    const google = makeSkill({
      id: 'cap_google',
      slug: 'google-workspace',
      name: 'Google Workspace',
      item_type: 'plugin',
      category: 'communication',
      always_on: true,
    })
    const registry = createCapabilityRegistryIndex([google])

    expect(resolveCapabilityIconItem('google-workspace', registry)).toMatchObject({
      id: 'cap_google',
      slug: 'google',
      label: 'Google Workspace',
      category: 'communication',
      alwaysOn: true,
      itemType: 'plugin',
      source: 'registry',
    })
    expect(resolveCapabilityIconItem('cap_google', registry)?.id).toBe('cap_google')
    expect(resolveCapabilityIconItem('plugin:google-workspace', registry)?.id).toBe('cap_google')
  })

  it('falls back to safe reference data when metadata is not hydrated', () => {
    expect(resolveCapabilityIconItem({
      slug: 'brave-search',
      label: 'Brave Search',
      item_type: 'skill',
      category: 'web',
    })).toMatchObject({
      id: 'brave-search',
      slug: 'brave',
      label: 'Brave Search',
      category: 'web',
      itemType: 'skill',
      source: 'reference',
    })
  })

  it('deduplicates resolved avatar items', () => {
    const notion = makeSkill({ id: 'notion-id', slug: 'notion', name: 'Notion', item_type: 'plugin' })
    const registry = createCapabilityRegistryIndex([notion])

    expect(resolveCapabilityIconItems(['notion', 'plugin:notion', 'notion-id'], registry)).toHaveLength(1)
  })

  it('extracts agent and team template capability refs', () => {
    const agentTemplate = {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'assistant',
      name: 'Assistant',
      description: 'Assistant',
      category: 'operations',
      kind: 'agent',
      source: 'platform',
      status: 'approved',
      is_public: true,
      owner_org_id: null,
      tags: [],
      spec: {
        kind: 'agent',
        system_prompt: 'Assist',
        plugins: ['google-workspace'],
        skills: ['bear-notes'],
      },
      params: [],
      preview_prompt: null,
      install_count: 0,
      created_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } satisfies TemplateCatalogEntry

    const teamTemplate = {
      id: '00000000-0000-4000-8000-000000000002',
      slug: 'brief',
      name: 'Brief',
      description: 'Brief',
      category: 'operations',
      kind: 'team',
      source: 'platform',
      status: 'approved',
      is_public: true,
      owner_org_id: null,
      tags: [],
      spec: {
        kind: 'team',
        objective: 'Brief',
        members: [
          { role: 'researcher', system_prompt: 'Research', plugins: ['notion'], skills: ['web-research'] },
          { role: 'writer', system_prompt: 'Write', plugins: ['notion', 'slack'] },
        ],
        edges: [],
      },
      params: [],
      preview_prompt: null,
      install_count: 0,
      created_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } satisfies TemplateCatalogEntry

    expect(getTemplateCapabilityRefs(agentTemplate)).toEqual([
      { slug: 'google-workspace', item_type: 'plugin' },
    ])
    expect(getTemplateCapabilityRefs(teamTemplate)).toEqual([
      { slug: 'notion', item_type: 'plugin' },
      { slug: 'web-research', item_type: 'skill' },
      { slug: 'slack', item_type: 'plugin' },
    ])
  })

  it('keeps icon alias rules centralized', () => {
    expect(normalizeCapabilityIconSlug('google-workspace')).toBe('google')
    expect(normalizeCapabilityIconSlug('google-calendar')).toBe('google-calendar')
  })
})
