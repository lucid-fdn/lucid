import { describe, expect, it } from 'vitest'
import { resolveBrowserOperatorProviderAuthRef } from '../provider-auth'
import type { BrowserOperatorAccount, BrowserOperatorByoRuntime } from '@contracts/browser-operator'

describe('Browser Operator provider auth refs', () => {
  it('prefers explicit Nango auth refs for provider API auth', () => {
    const account = {
      id: '00000000-0000-4000-8000-000000000001',
      contract_version: '2026-05-10',
      schema_version: 1,
      org_id: '00000000-0000-4000-8000-000000000002',
      merchant_key: 'instacart',
      merchant_name: 'Instacart',
      provider: 'steel',
      auth_provider: 'steel',
      auth_connection_id: 'nango-conn-steel',
      auth_state: 'connected',
      capabilities: [],
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
      metadata: {},
    } satisfies BrowserOperatorAccount

    expect(resolveBrowserOperatorProviderAuthRef(account)).toMatchObject({
      source: 'nango',
      authProvider: 'steel',
      authConnectionId: 'nango-conn-steel',
      usable: true,
    })
  })

  it('supports Nango refs for BYO runtime auth too', () => {
    const runtime = {
      id: '00000000-0000-4000-8000-000000000003',
      contract_version: '2026-05-10',
      schema_version: 1,
      org_id: '00000000-0000-4000-8000-000000000002',
      name: 'Customer Chrome',
      provider: 'remote_cdp',
      cdp_endpoint_ref: 'vault:cdp-url',
      auth_provider: 'custom-browser-runtime',
      auth_connection_id: 'nango-conn-runtime',
      status: 'draft',
      allowlisted_domains: [],
      privacy_mode: 'customer_managed',
      cost_policy: {},
      health: {},
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
      metadata: {},
    } satisfies BrowserOperatorByoRuntime

    expect(resolveBrowserOperatorProviderAuthRef(runtime)).toMatchObject({
      source: 'nango',
      authProvider: 'custom-browser-runtime',
      authConnectionId: 'nango-conn-runtime',
      usable: true,
    })
  })
})
