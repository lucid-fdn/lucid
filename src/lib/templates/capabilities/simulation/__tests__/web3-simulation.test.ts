import { describe, expect, it } from 'vitest'
import type { LucidPackManagedResource } from '@contracts/lucid-pack'
import { WEB3_CAPABILITY_TEMPLATES, smartWalletCopyDeskTemplate, web3IntelligenceSuiteTemplate } from '@/lib/templates/capabilities/catalog'
import { buildCapabilityTemplateInstallPreview } from '@/lib/templates/composition'
import { chunkChannelText } from '@/lib/channels/channel-text-chunks'
import {
  buildCapabilityTemplateChannelReport,
  resolveCapabilityTemplateChannelCommand,
} from '@/lib/templates/capabilities/channel-commands'
import { hashLucidPackResourceSpec } from '@/lib/packs'
import { buildLiveWeb3Scenario } from '../live-market'
import { assertWeb3TemplateQualityReady, scoreWeb3TemplateOutcome } from '../quality'
import { assertWeb3SimulationReady, formatWeb3SimulationOutput, runWeb3TemplateSimulation } from '../runner'
import { getWeb3SimulationScenario, WEB3_SIMULATION_SCENARIOS } from '../web3-fixtures'

const now = new Date('2026-05-11T00:00:00.000Z').toISOString()

function managedResource(input: Partial<LucidPackManagedResource> & Pick<LucidPackManagedResource, 'resourceKey'>): LucidPackManagedResource {
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

describe('Web3 capability template simulations', () => {
  it('has one deterministic simulation fixture per first-party template', () => {
    expect(WEB3_SIMULATION_SCENARIOS.map((scenario) => scenario.templateKey).sort()).toEqual(
      WEB3_CAPABILITY_TEMPLATES.map((manifest) => manifest.key).sort(),
    )
  })

  it('produces safe answer-shaped output for every first-party Web3 template', () => {
    for (const manifest of WEB3_CAPABILITY_TEMPLATES) {
      const scenario = getWeb3SimulationScenario(manifest.key)
      const result = runWeb3TemplateSimulation({ manifest, scenario })
      const quality = scoreWeb3TemplateOutcome({
        manifest,
        scenario,
        output: result.output,
        answerText: formatWeb3SimulationOutput(result.output),
      })

      expect(() => assertWeb3SimulationReady(result)).not.toThrow()
      expect(() => assertWeb3TemplateQualityReady(quality)).not.toThrow()
      expect(result.output.summary).toContain(manifest.name)
      expect(result.output.findings.length).toBeGreaterThanOrEqual(3)
      expect(result.output.evidence.length).toBeGreaterThanOrEqual(3)
      expect(result.output.risks.join('\n')).toMatch(/risk|review|read-only|gated/i)
      expect(result.output.next_actions.join('\n')).toContain('Mission Control')
    }
  })

  it('preserves full channel reports and relies on channel chunks instead of truncation', () => {
    for (const manifest of WEB3_CAPABILITY_TEMPLATES) {
      const scenario = getWeb3SimulationScenario(manifest.key)
      const commandName = manifest.resources.find((resource) => resource.kind === 'channel_command')
        ?.spec.command
      expect(commandName).toEqual(expect.any(String))

      const command = resolveCapabilityTemplateChannelCommand(`${commandName} ${scenario.prompt}`)
      expect(command).not.toBeNull()
      const report = buildCapabilityTemplateChannelReport({
        command: command!,
        channelLabel: 'Discord',
      })
      const result = runWeb3TemplateSimulation({ manifest, scenario })

      expect(report).not.toContain('…')
      expect(report).toContain('readiness check')
      expect(report).toContain('not live market data')
      expect(report).toContain(result.output.summary)
      for (const finding of result.output.findings) expect(report).toContain(finding)
      for (const evidence of result.output.evidence) expect(report).toContain(evidence)
      for (const risk of result.output.risks) expect(report).toContain(risk)
      for (const action of result.output.next_actions) expect(report).toContain(action)

      const chunks = chunkChannelText(report, 'discord')
      expect(chunks.every((chunk) => chunk.length <= 1900)).toBe(true)
      expect(chunks.join('\n')).toContain(result.output.next_actions.at(-1))
    }
  })

  it('keeps trading and automation templates approval-gated in simulated answers', () => {
    for (const manifest of [smartWalletCopyDeskTemplate, web3IntelligenceSuiteTemplate]) {
      const result = runWeb3TemplateSimulation({
        manifest,
        scenario: getWeb3SimulationScenario(manifest.key),
      })
      const answer = Object.values(result.output).flat().join('\n')

      expect(result.checks.approvalRequired).toBe(true)
      expect(result.checks.approvalPolicyPresent).toBe(true)
      expect(answer).toMatch(/approval|required|gated/i)
      expect(answer).toMatch(/do not execute/i)
      expect(result.checks.unsafeExecutionClaims).toEqual([])
    }
  })

  it('enriches Web3 simulations with live-market anchors for real external-market gates', () => {
    const scenario = getWeb3SimulationScenario('web3-token-war-room')
    const enriched = buildLiveWeb3Scenario({
      scenario,
      snapshot: {
        fetchedAt: '2026-05-13T00:00:00.000Z',
        ethereum: {
          blockNumber: 22_400_001,
          rpcUrl: 'https://ethereum.publicnode.com',
        },
        dex: {
          source: 'dexscreener',
          chainId: 'ethereum',
          dexId: 'uniswap',
          pairAddress: '0xpair',
          baseSymbol: 'ETH',
          quoteSymbol: 'USDC',
          priceUsd: '3200.12',
          liquidityUsd: 42_000_000,
          volume24hUsd: 18_000_000,
          priceChange24hPct: 2.4,
        },
        predictionMarket: {
          source: 'polymarket-gamma',
          question: 'Will ETH outperform BTC this week?',
          slug: 'eth-outperform-btc',
          volume: 90_000,
          liquidity: 22_000,
        },
        warnings: [],
        sourceStatuses: {
          ethereum: 'live',
          dexscreener: 'live',
          polymarket: 'live',
        },
      },
    })
    const result = runWeb3TemplateSimulation({
      manifest: WEB3_CAPABILITY_TEMPLATES.find((manifest) => manifest.key === enriched.templateKey)!,
      scenario: enriched,
    })
    const quality = scoreWeb3TemplateOutcome({
      manifest: WEB3_CAPABILITY_TEMPLATES.find((manifest) => manifest.key === enriched.templateKey)!,
      scenario: enriched,
      output: result.output,
      answerText: formatWeb3SimulationOutput(result.output),
    })

    expect(enriched.evidence.map((item) => item.source)).toEqual(expect.arrayContaining([
      'live:ethereum_rpc',
      'live:dexscreener',
      'live:polymarket_gamma',
    ]))
    expect(formatWeb3SimulationOutput(result.output)).toContain('22400001')
    expect(() => assertWeb3TemplateQualityReady(quality)).not.toThrow()
  })

  it('fails the quality gate on unsafe or thin answers', () => {
    const manifest = smartWalletCopyDeskTemplate
    const scenario = getWeb3SimulationScenario(manifest.key)
    const quality = scoreWeb3TemplateOutcome({
      manifest,
      scenario,
      answerText: 'Summary: I executed the swap. Findings: done.',
    })

    expect(quality.passed).toBe(false)
    expect(quality.failures.join('\n')).toMatch(/unsafe execution|Mission Control|missing/i)
  })

  it('keeps optional suite dependencies as warnings instead of blockers', () => {
    const preview = buildCapabilityTemplateInstallPreview({
      packId: 'simulation:web3-intelligence-suite',
      manifest: web3IntelligenceSuiteTemplate,
      existingResources: [
        managedResource({
          resourceKey: 'integration:web3-provider',
          metadata: {
            provides: ['integration.web3.data-provider'],
          },
        }),
      ],
    })

    expect(preview.status).toBe('ready')
    expect(preview.requiredSetup).toEqual([
      expect.objectContaining({ capability: 'integration.wallet.read', required: false }),
      expect.objectContaining({ capability: 'integration.prediction-market.read', required: false }),
    ])
  })

  it('stress-tests preview and reconcile determinism across repeated template installs', () => {
    const existingResources = WEB3_CAPABILITY_TEMPLATES.flatMap((manifest) => {
      return manifest.resources.map((resource) => managedResource({
        resourceKey: resource.key,
        resourceKind: resource.kind,
        managementPolicy: resource.policy,
        specHash: hashLucidPackResourceSpec(resource.spec),
      }))
    })
    existingResources.push(managedResource({
      resourceKey: 'integration:web3-provider',
      metadata: {
        provides: [
          'integration.web3.data-provider',
          'integration.wallet.read',
          'integration.prediction-market.read',
          'integration.channel.alerts',
          'integration.wallet.execute',
        ],
      },
    }))

    for (let index = 0; index < 250; index += 1) {
      const manifest = WEB3_CAPABILITY_TEMPLATES[index % WEB3_CAPABILITY_TEMPLATES.length]
      const preview = buildCapabilityTemplateInstallPreview({
        packId: `stress:${manifest.key}`,
        manifest,
        existingResources,
      })
      const previewAgain = buildCapabilityTemplateInstallPreview({
        packId: `stress:${manifest.key}`,
        manifest,
        existingResources,
      })

      expect(preview.summary).toEqual(previewAgain.summary)
      expect(preview.status).toBe(previewAgain.status)
      expect(preview.summary.reuses).toBe(manifest.resources.length)
      expect(preview.summary.creates).toBe(0)
    }
  })
})
