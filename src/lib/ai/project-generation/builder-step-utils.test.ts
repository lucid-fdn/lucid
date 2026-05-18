import { describe, expect, it } from 'vitest'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { getPendingBuilderConnections } from './builder-step-utils'
import type { GenerationDraft } from './schemas'

function makeCapability(overrides: Partial<UnifiedSkillItem>): UnifiedSkillItem {
  return {
    id: overrides.id ?? 'plugin-google',
    slug: overrides.slug ?? 'google',
    name: overrides.name ?? 'Google',
    description: null,
    category: 'productivity',
    item_type: 'plugin',
    section: 'connected',
    installed: true,
    is_active: true,
    installation_id: null,
    activation_id: null,
    tools: [],
    enabled_tools: null,
    tool_count: 0,
    can_act: true,
    always_on: false,
    removable: true,
    connection_status: 'setup_required',
    auth_provider: 'google',
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: null,
    version: '1',
    author: null,
    source: 'first-party',
    verified: true,
    ...overrides,
  }
}

const draft = {
  agent: {
    plugins: ['google'],
    skills: [],
  },
} as GenerationDraft

describe('getPendingBuilderConnections', () => {
  it('requires OAuth when a selected app has no active connection', () => {
    const [connection] = getPendingBuilderConnections(draft, [
      makeCapability({
        connection_status: 'setup_required',
        connection_options: [],
      }),
    ])

    expect(connection.providerId).toBe('google')
    expect(connection.setupMode).toBe('connect')
  })

  it('does not block setup when a selected app has one reusable account', () => {
    const pending = getPendingBuilderConnections(draft, [
      makeCapability({
        connection_status: 'connected',
        connection_row_id: 'conn-row-1',
        selected_connection_row_id: 'conn-row-1',
        connection_options: [
          {
            id: 'conn-row-1',
            connection_id: 'nango-conn-1',
            account_label: 'user@example.com',
            account_id: 'acct-1',
            status: 'active',
          },
        ],
      }),
    ])

    expect(pending).toEqual([])
  })

  it('asks the user to choose an account when multiple reusable accounts exist', () => {
    const [connection] = getPendingBuilderConnections(draft, [
      makeCapability({
        connection_status: 'connected',
        connection_row_id: 'conn-row-1',
        selected_connection_row_id: 'conn-row-1',
        connection_options: [
          {
            id: 'conn-row-1',
            connection_id: 'nango-conn-1',
            account_label: 'ops@example.com',
            account_id: 'acct-1',
            status: 'active',
          },
          {
            id: 'conn-row-2',
            connection_id: 'nango-conn-2',
            account_label: 'sales@example.com',
            account_id: 'acct-2',
            status: 'active',
          },
        ],
      }),
    ])

    expect(connection.setupMode).toBe('choose_account')
    expect(connection.connectionOptions).toHaveLength(2)
    expect(connection.selectedConnectionRowId).toBe('conn-row-1')
  })
})
