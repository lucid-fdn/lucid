import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsCapabilitySourceSnapshot,
  getUnknownWorkflowCapabilityRequirements,
  isKnownAgentOpsCapabilityRequirement,
  listAgentOpsBuiltinSkillSources,
  listAgentOpsChannelCapabilities,
  listAgentOpsProductCapabilities,
  listAgentOpsRuntimeProfiles,
} from '../capability-source'
import { AGENT_OPS_WORKFLOWS } from '../workflow-registry'

function expectUnique(values: string[], label: string) {
  expect(new Set(values).size, `${label} should not contain duplicates`).toBe(values.length)
}

describe('Agent Ops capability source', () => {
  it('has stable unique identifiers across registry slices', () => {
    expectUnique(listAgentOpsProductCapabilities().map((capability) => capability.id), 'product capabilities')
    expect(listAgentOpsProductCapabilities().map((capability) => capability.id)).toContain('eval:quality-gate-pack')
    expectUnique(listAgentOpsRuntimeProfiles().map((profile) => profile.id), 'runtime profiles')
    expectUnique(listAgentOpsChannelCapabilities().map((channel) => channel.id), 'channel capabilities')
    expectUnique(listAgentOpsBuiltinSkillSources().map((skill) => skill.slug), 'built-in skill sources')
  })

  it('covers every workflow capability requirement', () => {
    expect(getUnknownWorkflowCapabilityRequirements(AGENT_OPS_WORKFLOWS)).toEqual([])
  })

  it('keeps Agent Ops runtime support engine-agnostic', () => {
    const profiles = listAgentOpsRuntimeProfiles()

    expect(profiles.map((profile) => profile.id)).toEqual(['c1_managed', 'c2a_autonomous', 'shared'])
    expect(profiles.find((profile) => profile.id === 'shared')?.supportedEngines).toContain('openclaw')
    expect(profiles.find((profile) => profile.id === 'shared')?.supportedEngines).toContain('hermes')
    expect(profiles.find((profile) => profile.id === 'c1_managed')?.supportedEngines).toContain('hermes')
    expect(profiles.find((profile) => profile.id === 'c2a_autonomous')?.supportedEngines).toContain('openclaw')
  })

  it('keeps channel support explicit instead of assuming universal parity', () => {
    const channels = listAgentOpsChannelCapabilities()

    expect(channels.map((channel) => channel.id)).toEqual([
      'discord',
      'imessage',
      'msteams',
      'slack',
      'telegram',
      'web',
      'whatsapp',
    ])
    expect(channels.find((channel) => channel.id === 'discord')?.streamingUx).toBe('supported')
    expect(channels.find((channel) => channel.id === 'whatsapp')?.streamingUx).toBe('not_supported')
  })

  it('recognizes declared capability namespaces used by future workflow packs', () => {
    expect(isKnownAgentOpsCapabilityRequirement('tool:browser')).toBe(true)
    expect(isKnownAgentOpsCapabilityRequirement('runtime:dedicated')).toBe(true)
    expect(isKnownAgentOpsCapabilityRequirement('channel:discord')).toBe(true)
    expect(isKnownAgentOpsCapabilityRequirement('skill:lucid-market-intelligence')).toBe(true)
    expect(isKnownAgentOpsCapabilityRequirement('browser:procedure')).toBe(true)
    expect(isKnownAgentOpsCapabilityRequirement('design:taste-profile')).toBe(true)
    expect(isKnownAgentOpsCapabilityRequirement('decision:pacing')).toBe(true)
  })

  it('builds a serializable docs/UI snapshot', () => {
    const snapshot = buildAgentOpsCapabilitySourceSnapshot()

    expect(snapshot.version).toMatch(/^2026-05-07\.agent-ops/)
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })
})
