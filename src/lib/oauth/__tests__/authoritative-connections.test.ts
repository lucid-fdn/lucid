import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({
  supabase: {},
}))

import {
  applyAuthoritativeConnectionIds,
  resolveAuthoritativeConnectionsFromAppBindings,
} from '@/lib/oauth/authoritative-connections'

describe('resolveAuthoritativeConnectionsFromAppBindings', () => {
  it('uses active assistant app bindings as the runtime connection source', () => {
    expect(resolveAuthoritativeConnectionsFromAppBindings([
      {
        plugin_catalog: { auth_provider: 'notion' },
        org_integration_connections: { connection_id: 'notion-selected', status: 'active' },
      },
      {
        plugin_catalog: { auth_provider: 'slack' },
        org_integration_connections: { connection_id: 'slack-expired', status: 'expired' },
      },
    ])).toEqual({ notion: 'notion-selected' })
  })
})

describe('applyAuthoritativeConnectionIds', () => {
  it('overrides stale oauth connection ids with installation-backed ones', () => {
    const [row] = applyAuthoritativeConnectionIds(
      [
        {
          plugin_slug: 'notion',
          auth_provider: 'notion',
          connection_id: 'old-conn',
        },
      ],
      { notion: 'new-conn' },
    )

    expect(row.connection_id).toBe('new-conn')
  })

  it('leaves rows unchanged when no authoritative connection exists', () => {
    const [row] = applyAuthoritativeConnectionIds(
      [
        {
          plugin_slug: 'notion',
          auth_provider: 'notion',
          connection_id: 'old-conn',
        },
      ],
      {},
    )

    expect(row.connection_id).toBe('old-conn')
  })
})
