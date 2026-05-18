import { describe, expect, it } from 'vitest'
import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'
import { hashLucidPackResourceSpec } from '@/lib/packs'
import { buildCapabilityTemplateInstallPreview } from '../preview'
import { WEB3_CAPABILITY_TEMPLATES, smartWalletCopyDeskTemplate, whaleWatchtowerTemplate } from '@/lib/templates/capabilities/catalog'

const now = new Date('2026-05-11T00:00:00.000Z').toISOString()

function resource(input: Partial<LucidPackManagedResource> & Pick<LucidPackManagedResource, 'resourceKey'>): LucidPackManagedResource {
  return {
    id: `00000000-0000-4000-8000-${input.resourceKey.replace(/[^0-9]/g, '').padEnd(12, '0').slice(0, 12)}`,
    orgId: '11111111-1111-4111-8111-111111111111',
    installId: '22222222-2222-4222-8222-222222222222',
    resourceKey: input.resourceKey,
    resourceKind: input.resourceKind ?? 'policy',
    resourceId: input.resourceId ?? null,
    managementPolicy: input.managementPolicy ?? 'managed',
    status: input.status ?? 'active',
    lastReconciledAt: input.lastReconciledAt ?? now,
    forkedFromResourceId: input.forkedFromResourceId ?? null,
    forkedAt: input.forkedAt ?? null,
    forkReason: input.forkReason ?? null,
    uninstalledAt: input.uninstalledAt ?? null,
    uninstallReason: input.uninstallReason ?? null,
    specHash: input.specHash ?? 'existing-hash',
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}

describe('capability template install preview', () => {
  it('validates every first-party Web3 capability template manifest', () => {
    expect(WEB3_CAPABILITY_TEMPLATES.map((template) => template.key)).toEqual([
      'web3-whale-watchtower',
      'web3-token-war-room',
      'web3-prediction-market-alpha-desk',
      'web3-portfolio-risk-agent',
      'web3-smart-wallet-copy-desk',
      'web3-intelligence-suite',
    ])
    for (const template of WEB3_CAPABILITY_TEMPLATES) {
      expect(template.composition?.provides.length).toBeGreaterThan(0)
      expect(template.metadata.template_type).toBe('capability')
      expect(template.resources.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('shows required setup when provider capabilities are missing', () => {
    const preview = buildCapabilityTemplateInstallPreview({
      packId: '33333333-3333-4333-8333-333333333333',
      manifest: whaleWatchtowerTemplate,
      existingResources: [],
    })

    expect(preview.status).toBe('needs_setup')
    expect(preview.summary.creates).toBe(5)
    expect(preview.requiredSetup.map((setup) => setup.capability)).toEqual([
      'integration.web3.data-provider',
      'integration.wallet.read',
      'integration.channel.alerts',
    ])
  })

  it('reuses installed resources and configured capabilities deterministically', () => {
    const manifestResource = whaleWatchtowerTemplate.resources[0]
    const preview = buildCapabilityTemplateInstallPreview({
      packId: '33333333-3333-4333-8333-333333333333',
      manifest: whaleWatchtowerTemplate,
      existingResources: [
        resource({
          resourceKey: manifestResource.key,
          resourceKind: manifestResource.kind,
          specHash: hashLucidPackResourceSpec(manifestResource.spec),
        }),
        resource({
          resourceKey: 'integration:web3-provider',
          metadata: {
            provides: ['integration.web3.data-provider', 'integration.wallet.read', 'integration.channel.alerts'],
          },
        }),
      ],
    })

    expect(preview.status).toBe('ready')
    expect(preview.summary.reuses).toBe(1)
    expect(preview.requiredSetup).toEqual([])
  })

  it('keeps high-risk execution templates installable only with an explicit approval policy', () => {
    const preview = buildCapabilityTemplateInstallPreview({
      packId: '33333333-3333-4333-8333-333333333333',
      manifest: smartWalletCopyDeskTemplate,
      existingResources: [
        resource({
          resourceKey: 'integration:web3-provider',
          metadata: {
            provides: ['integration.web3.data-provider', 'integration.wallet.read', 'web3.swap.execute'],
          },
        }),
      ],
    })

    expect(preview.approvals).toEqual([])
    expect(preview.warnings).toContain('Another swap execution template is already installed. Keep one owner for autonomous execution policy.')
    expect(preview.status).toBe('ready')
  })

  it('blocks high-risk capabilities when a custom manifest forgets the approval policy', () => {
    const unsafeManifest: LucidPackManifest = {
      ...smartWalletCopyDeskTemplate,
      resources: smartWalletCopyDeskTemplate.resources.filter((item) => item.kind !== 'policy'),
    }
    const preview = buildCapabilityTemplateInstallPreview({
      packId: '33333333-3333-4333-8333-333333333333',
      manifest: unsafeManifest,
      existingResources: [
        resource({
          resourceKey: 'integration:web3-provider',
          metadata: {
            provides: ['integration.web3.data-provider', 'integration.wallet.read'],
          },
        }),
      ],
    })

    expect(preview.status).toBe('needs_setup')
    expect(preview.approvals).toEqual([{
      capability: 'web3.swap.execute',
      risk: 'high',
      reason: 'High-risk capability needs an explicit approval policy before it can be ready.',
    }])
  })
})
