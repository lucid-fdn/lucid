import { describe, expect, it } from 'vitest'

import {
  AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH,
  buildAgentOpsExternalHostInstallerManifest,
  buildAgentOpsExternalHostPack,
  buildAgentOpsExternalHostPackManifest,
  listAgentOpsExternalHostPacks,
  renderAgentOpsExternalHostInstructions,
  validateAgentOpsExternalHostInstallerManifest,
} from '../external-host-packs'
import { listAgentOpsWorkflows } from '../workflow-registry'
import { AGENT_OPS_OUTPUT_SECTIONS } from '../workflow-types'

describe('Agent Ops external host packs', () => {
  it('declares portable packs for the supported external hosts', () => {
    const packs = listAgentOpsExternalHostPacks()

    expect(packs.map((pack) => pack.id)).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'hermes',
      'openclaw',
      'opencode',
    ])
    expect(new Set(packs.map((pack) => pack.installTarget)).size).toBe(packs.length)
    expect(packs.find((pack) => pack.id === 'codex')?.installTarget).toBe('.agents/skills/lucid-agent-ops/SKILL.md')
    expect(packs.find((pack) => pack.id === 'cursor')?.format).toBe('cursor_rule')
  })

  it('builds exports from the Lucid workflow and operating contract registries', () => {
    const exported = buildAgentOpsExternalHostPack({ hostId: 'codex' })

    expect(exported.sourceOfTruth).toBe(AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH)
    expect(exported.workflows.map((workflow) => workflow.id)).toEqual(listAgentOpsWorkflows().map((workflow) => workflow.id))
    expect(exported.operatingContract.outputSections).toEqual(AGENT_OPS_OUTPUT_SECTIONS)
    expect(exported.operatingContract.releaseQualityChecks).toContain('stale-docs')
    expect(exported.operatingContract.evalScenarios).toContain('runtime-compatibility')
    expect(exported.operatingContract.runtimeProfiles).toEqual(['c1_managed', 'c2a_autonomous', 'shared'])
  })

  it('renders host-specific instructions without making host files runtime authority', () => {
    const codex = renderAgentOpsExternalHostInstructions({ hostId: 'codex' })
    const cursor = renderAgentOpsExternalHostInstructions({ hostId: 'cursor' })

    expect(codex).toContain('Lucid Cloud remains the system of record')
    expect(codex).toContain('Do not fork workflow definitions into host-only behavior')
    expect(codex).toContain('Always produce these sections: Summary, Findings, Evidence, Risks, Next Actions')
    expect(codex).toContain('Mission Control owns workflow state')
    expect(cursor).toMatch(/^---\ndescription: Lucid Agent Ops operating contract for Cursor\nalwaysApply: false\n---/)
  })

  it('keeps the manifest serializable for docs, UI, and installer surfaces', () => {
    const manifest = buildAgentOpsExternalHostPackManifest()

    expect(manifest.sourceOfTruth).toBe('Lucid Cloud / Mission Control')
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest)
    expect(manifest.packs.every((pack) => pack.installTarget.length > 0)).toBe(true)
  })

  it('builds a deterministic installer manifest for external host clients', () => {
    const manifest = buildAgentOpsExternalHostInstallerManifest({
      baseUrl: 'https://app.lucid.foundation/',
    })

    expect(manifest.authority).toBe('lucid_cloud')
    expect(manifest.baseUrl).toBe('https://app.lucid.foundation')
    expect(manifest.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        hostId: 'codex',
        rawUrl: 'https://app.lucid.foundation/api/agent-ops/external-host-packs/codex?format=raw',
        jsonUrl: 'https://app.lucid.foundation/api/agent-ops/external-host-packs/codex',
        contentType: 'text/markdown; charset=utf-8',
      }),
      expect.objectContaining({
        hostId: 'cursor',
        contentType: 'text/plain; charset=utf-8',
      }),
    ]))
    expect(manifest.artifacts.every((artifact) => artifact.contentHash.startsWith('fnv1a32:'))).toBe(true)
    expect(validateAgentOpsExternalHostInstallerManifest(manifest)).toEqual({ valid: true, errors: [] })
  })

  it('detects installer manifest drift before external clients consume stale packs', () => {
    const manifest = buildAgentOpsExternalHostInstallerManifest()
    const tampered = {
      ...manifest,
      artifacts: manifest.artifacts.map((artifact) => artifact.hostId === 'codex'
        ? { ...artifact, contentHash: 'fnv1a32:00000000' }
        : artifact),
    }

    expect(validateAgentOpsExternalHostInstallerManifest(tampered)).toEqual({
      valid: false,
      errors: ['contentHash mismatch for codex'],
    })
  })
})
