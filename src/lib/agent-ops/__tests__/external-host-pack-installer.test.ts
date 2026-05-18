import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsExternalHostInstallPlan,
  buildAgentOpsExternalHostInstallPlanMatrix,
  inspectAgentOpsExternalHostInstalledState,
  summarizeAgentOpsExternalHostInstalledStates,
  validateAgentOpsExternalHostInstallTarget,
  verifyAgentOpsExternalHostInstallContent,
} from '../external-host-pack-installer'
import {
  buildAgentOpsExternalHostInstallerManifest,
  renderAgentOpsExternalHostInstructions,
} from '../external-host-packs'

describe('Agent Ops external host pack installer', () => {
  it('builds a dry-run install plan from the generated installer manifest', () => {
    const plan = buildAgentOpsExternalHostInstallPlan({
      hostId: 'codex',
      targetRoot: '/tmp/acme',
      baseUrl: 'https://app.lucid.foundation/',
    })

    expect(plan).toEqual(expect.objectContaining({
      hostId: 'codex',
      installTarget: '.agents/skills/lucid-agent-ops/SKILL.md',
      installPath: '/tmp/acme/.agents/skills/lucid-agent-ops/SKILL.md',
      rawUrl: 'https://app.lucid.foundation/api/agent-ops/external-host-packs/codex?format=raw',
      jsonUrl: 'https://app.lucid.foundation/api/agent-ops/external-host-packs/codex',
      dryRun: true,
      overwrite: false,
    }))
    expect(plan.contentHash).toMatch(/^fnv1a32:/)
  })

  it('builds a multi-host install matrix for CI and doctor checks', () => {
    const matrix = buildAgentOpsExternalHostInstallPlanMatrix({
      targetRoot: '/tmp/acme',
      baseUrl: 'https://app.lucid.foundation',
    })

    expect(matrix.hostCount).toBe(6)
    expect(matrix.plans.map((plan) => plan.hostId)).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'hermes',
      'openclaw',
      'opencode',
    ])
    expect(matrix.installTargets).toEqual(expect.arrayContaining([
      '.agents/skills/lucid-agent-ops/SKILL.md',
      '.cursor/rules/lucid-agent-ops.mdc',
      'AGENTS.md',
    ]))
    expect(matrix.plans.every((plan) => plan.dryRun)).toBe(true)
  })

  it('verifies rendered install content against manifest metadata', () => {
    const manifest = buildAgentOpsExternalHostInstallerManifest()
    const artifact = manifest.artifacts.find((candidate) => candidate.hostId === 'cursor')
    expect(artifact).toBeTruthy()

    const verification = verifyAgentOpsExternalHostInstallContent({
      artifact: artifact!,
      content: renderAgentOpsExternalHostInstructions({ hostId: 'cursor' }),
    })

    expect(verification).toEqual(expect.objectContaining({
      valid: true,
      errors: [],
      actualHash: artifact!.contentHash,
      actualLength: artifact!.contentLength,
    }))
  })

  it('detects tampered content before install', () => {
    const manifest = buildAgentOpsExternalHostInstallerManifest()
    const artifact = manifest.artifacts.find((candidate) => candidate.hostId === 'openclaw')
    expect(artifact).toBeTruthy()

    const verification = verifyAgentOpsExternalHostInstallContent({
      artifact: artifact!,
      content: `${renderAgentOpsExternalHostInstructions({ hostId: 'openclaw' })}\nTampered`,
    })

    expect(verification.valid).toBe(false)
    expect(verification.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('contentHash mismatch'),
      expect.stringContaining('contentLength mismatch'),
    ]))
  })

  it('classifies installed host pack state for doctor checks', () => {
    const manifest = buildAgentOpsExternalHostInstallerManifest()
    const artifact = manifest.artifacts.find((candidate) => candidate.hostId === 'codex')
    expect(artifact).toBeTruthy()

    const current = inspectAgentOpsExternalHostInstalledState({
      artifact: artifact!,
      existingContent: renderAgentOpsExternalHostInstructions({ hostId: 'codex' }),
    })
    const missing = inspectAgentOpsExternalHostInstalledState({
      artifact: artifact!,
      existingContent: null,
    })
    const stale = inspectAgentOpsExternalHostInstalledState({
      artifact: artifact!,
      existingContent: 'old pack',
    })

    expect(current).toEqual(expect.objectContaining({
      state: 'current',
      valid: true,
      reason: 'Installed host pack matches the generated manifest.',
    }))
    expect(missing).toEqual(expect.objectContaining({
      state: 'missing',
      valid: false,
      actualHash: null,
      actualLength: null,
    }))
    expect(stale).toEqual(expect.objectContaining({
      state: 'stale',
      valid: false,
      expectedHash: artifact!.contentHash,
    }))
    expect(stale.reason).toContain('contentHash mismatch')
  })

  it('summarizes installed-state matrices', () => {
    const manifest = buildAgentOpsExternalHostInstallerManifest()
    const codex = manifest.artifacts.find((candidate) => candidate.hostId === 'codex')
    const cursor = manifest.artifacts.find((candidate) => candidate.hostId === 'cursor')
    const openclaw = manifest.artifacts.find((candidate) => candidate.hostId === 'openclaw')
    expect(codex && cursor && openclaw).toBeTruthy()

    const summary = summarizeAgentOpsExternalHostInstalledStates([
      inspectAgentOpsExternalHostInstalledState({
        artifact: codex!,
        existingContent: renderAgentOpsExternalHostInstructions({ hostId: 'codex' }),
      }),
      inspectAgentOpsExternalHostInstalledState({
        artifact: cursor!,
        existingContent: null,
      }),
      inspectAgentOpsExternalHostInstalledState({
        artifact: openclaw!,
        existingContent: 'old pack',
      }),
    ])

    expect(summary).toEqual({
      total: 3,
      current: 1,
      missing: 1,
      stale: 1,
      valid: false,
    })
  })

  it('rejects unsafe install targets', () => {
    expect(() => validateAgentOpsExternalHostInstallTarget('../AGENTS.md')).toThrow(/traverse/)
    expect(() => validateAgentOpsExternalHostInstallTarget('/tmp/AGENTS.md')).toThrow(/relative/)
    expect(() => validateAgentOpsExternalHostInstallTarget('C:\\tmp\\AGENTS.md')).toThrow(/relative/)
    expect(() => validateAgentOpsExternalHostInstallTarget('foo//bar.md')).toThrow(/empty segment/)
  })
})
