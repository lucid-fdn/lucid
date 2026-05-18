import { describe, expect, it } from 'vitest'
import { resolveBrowserOperatorProfileAffinity } from '../profile-store'
import type { BrowserOperatorAccount, BrowserOperatorProfile } from '@contracts/browser-operator'

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: '00000000-0000-4000-8000-000000000002',
  merchant_key: 'instacart',
  merchant_name: 'Instacart',
  provider: 'steel',
  auth_state: 'connected',
  capabilities: [],
  provider_profile_ref: 'steel-profile-1',
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
} satisfies BrowserOperatorAccount

describe('Browser Operator profile store', () => {
  it('uses active profile affinity before legacy account refs', () => {
    const profile = {
      id: '00000000-0000-4000-8000-000000000003',
      contract_version: '2026-05-10',
      schema_version: 1,
      org_id: account.org_id,
      browser_account_id: account.id,
      provider: 'steel',
      provider_profile_ref: 'steel-profile-active',
      status: 'active',
      migration_status: 'not_required',
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
      metadata: {},
    } satisfies BrowserOperatorProfile

    expect(resolveBrowserOperatorProfileAffinity({ account, profiles: [profile] })).toMatchObject({
      provider: 'steel',
      profileRef: 'steel-profile-active',
      usable: true,
      reason: 'active_profile',
    })
  })

  it('blocks degraded profiles instead of silently falling back', () => {
    const profile = {
      id: '00000000-0000-4000-8000-000000000004',
      contract_version: '2026-05-10',
      schema_version: 1,
      org_id: account.org_id,
      browser_account_id: account.id,
      provider: 'steel',
      status: 'degraded',
      migration_status: 'pending',
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
      metadata: {},
    } satisfies BrowserOperatorProfile

    expect(resolveBrowserOperatorProfileAffinity({ account, profiles: [profile] })).toMatchObject({
      provider: 'steel',
      usable: false,
      reason: 'profile_degraded',
    })
  })
})
