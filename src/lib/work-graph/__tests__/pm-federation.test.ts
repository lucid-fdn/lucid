import { describe, expect, it } from 'vitest'

import type { OrgPmProviderConfig } from '@contracts/pm-adapter'
import {
  resolveWorkGraphPmFederationConfig,
  serializeWorkGraphPmFederationConfigPatch,
  unsupportedProviderNotes,
} from '../pm-federation/config'
import { decideInboundPmPatch } from '../pm-federation/field-authority'

function config(overrides: Partial<OrgPmProviderConfig> = {}): OrgPmProviderConfig {
  return {
    id: 'cfg-1',
    orgId: 'org-1',
    provider: 'linear',
    enabled: true,
    isPrimary: true,
    nangoConnectionId: 'conn-1',
    config: {},
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
    createdBy: null,
    ...overrides,
  }
}

describe('Work Graph PM federation config', () => {
  it('preserves legacy PM behavior when no Work Graph config exists', () => {
    const resolved = resolveWorkGraphPmFederationConfig(config())
    const decision = decideInboundPmPatch({
      config: resolved,
      eventType: 'issue.updated',
      patch: { title: 'Remote title' },
    })

    expect(resolved.mode).toBe('mirror_only')
    expect(decision.applyPatch).toBe(true)
    expect(decision.conflictState).toBe('remote_changed')
  })

  it('supports provider-authoritative field ownership without engine-specific branches', () => {
    const serialized = serializeWorkGraphPmFederationConfigPatch({
      mode: 'provider_authoritative',
      fieldAuthority: {
        title: 'provider',
        description: 'lucid',
      },
      providerProjectRef: 'LIN-PROJ',
    })
    const resolved = resolveWorkGraphPmFederationConfig(config({ config: serialized }))

    expect(resolved.provider_project_ref).toBe('LIN-PROJ')
    expect(resolved.field_authority.title).toBe('provider')
    expect(resolved.field_authority.description).toBe('lucid')
  })

  it('requires review when a provider changes a Lucid-owned field', () => {
    const resolved = resolveWorkGraphPmFederationConfig(config({
      config: serializeWorkGraphPmFederationConfigPatch({
        mode: 'bidirectional_review',
        fieldAuthority: { title: 'lucid' },
      }),
    }))
    const decision = decideInboundPmPatch({
      config: resolved,
      eventType: 'issue.updated',
      patch: { title: 'Remote title' },
    })

    expect(decision.applyPatch).toBe(false)
    expect(decision.conflictState).toBe('conflict')
    expect(decision.fields[0]).toMatchObject({
      field: 'title',
      authority: 'lucid',
      apply: false,
    })
  })

  it('marks Jira as reserved until a real adapter ships', () => {
    expect(unsupportedProviderNotes('jira')[0]).toContain('reserved')
  })
})
