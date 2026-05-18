import { describe, expect, it } from 'vitest'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'
import {
  buildSelectedBuilderAppBindings,
  mapPendingConnectionsToBuilderRequirements,
} from '@/lib/agent-builder/connect-agent-apps'

describe('connect-agent-apps', () => {
  it('maps pending connections into shell-neutral builder requirements', () => {
    expect(mapPendingConnectionsToBuilderRequirements([
      {
        id: 'google-item',
        slug: 'google',
        name: 'Google',
        category: 'productivity',
        providerId: 'google',
        providerName: 'Google Workspace',
        itemType: 'plugin',
        connectionStatus: 'setup_required',
        setupMode: 'connect',
        selectedConnectionRowId: null,
        connectionOptions: [],
      },
    ])).toEqual([
      {
        slug: 'google',
        providerId: 'google',
        label: 'Google Workspace',
      },
    ])
  })

  it('builds app bindings only for selected plugins', () => {
    const draft = {
      agent: {
        plugins: ['google'],
        skills: ['internal-note'],
      },
    } as GenerationDraft
    const items = [
      {
        slug: 'google',
        item_type: 'plugin',
        auth_provider: 'google',
        connection_row_id: 'conn-default',
      },
      {
        slug: 'slack',
        item_type: 'plugin',
        auth_provider: 'slack',
        connection_row_id: 'conn-slack',
      },
      {
        slug: 'internal-note',
        item_type: 'skill',
        auth_provider: 'notes',
        connection_row_id: 'conn-notes',
      },
    ] as UnifiedSkillItem[]

    expect(buildSelectedBuilderAppBindings({
      draft,
      availableUnifiedSkills: items,
      selectedConnectionIdsByProvider: { google: 'conn-selected' },
    })).toEqual({ google: 'conn-selected' })
  })

  it('builds app bindings for selected team-member plugins', () => {
    const draft = {
      mode: 'blank-team',
      team: {
        kind: 'team',
        members: [
          {
            role: 'Coordinator',
            is_coordinator: true,
            system_prompt: 'Coordinate.',
            plugins: ['notion'],
          },
          {
            role: 'Operator',
            system_prompt: 'Operate.',
            plugins: ['google'],
          },
        ],
        edges: [],
      },
    } as GenerationDraft
    const items = [
      {
        slug: 'google',
        item_type: 'plugin',
        auth_provider: 'google',
        connection_row_id: 'conn-google-default',
      },
      {
        slug: 'notion',
        item_type: 'plugin',
        auth_provider: 'notion',
        connection_row_id: 'conn-notion-default',
      },
    ] as UnifiedSkillItem[]

    expect(buildSelectedBuilderAppBindings({
      draft,
      availableUnifiedSkills: items,
      selectedConnectionIdsByProvider: { google: 'conn-google-selected' },
    })).toEqual({
      google: 'conn-google-selected',
      notion: 'conn-notion-default',
    })
  })
})
