import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsWorkflowTeamOpsProjection,
  buildTeamOpsDispatchPlan,
  chooseTeamOpsDispatchTier,
  evaluateTeamOpsChannelLaunchCompatibility,
  evaluateTeamOpsRuntimeCompatibility,
  listTeamOpsSpecialistProfiles,
  selectTeamOpsSpecialists,
} from '../team-ops'
import { getAgentOpsWorkflow, listAgentOpsWorkflows } from '../workflow-registry'

describe('Agent Ops Team Ops dispatch', () => {
  it('projects every workflow through the Team Ops dispatch contract', () => {
    for (const workflow of listAgentOpsWorkflows()) {
      const projection = buildAgentOpsWorkflowTeamOpsProjection(workflow)

      expect(projection.dispatchTier).toMatch(/^(simple|medium|heavy|full|plan)$/)
      expect(projection.compatibleRuntimeProfiles.length).toBeGreaterThan(0)
      expect(projection.missingRuntimeProfiles).toEqual([])
    }
  })

  it('selects specialists without binding them to a concrete engine', () => {
    const review = getAgentOpsWorkflow('review')
    const specialists = selectTeamOpsSpecialists(review)

    expect(specialists.map((specialist) => specialist.slug)).toEqual([
      'correctness',
      'api-contract',
      'testing',
      'security',
    ])
    expect(specialists.every((specialist) => specialist.requiredCapabilities.includes('tool:repo.read'))).toBe(true)
  })

  it('adds Browser Operator as a capability profile, not an OpenClaw-only behavior', () => {
    const qa = getAgentOpsWorkflow('check-page')
    const projection = buildAgentOpsWorkflowTeamOpsProjection(qa)

    expect(projection.dispatchTier).toBe('full')
    expect(projection.specialists.map((specialist) => specialist.slug)).toContain('browser-qa')
    expect(projection.compatibleRuntimeProfiles).toEqual(['c1_managed', 'c2a_autonomous', 'shared'])
    expect(projection.partialRuntimeProfiles).toContain('shared')
    expect(projection.channelCompatibility.map((channel) => channel.channelId)).toContain('discord')
    expect(projection.channelCompatibility.find((channel) => channel.channelId === 'discord')).toMatchObject({
      launchSupported: true,
      reportSupported: true,
    })
  })

  it('rejects unsupported engine/profile pairs through compatibility metadata', () => {
    const review = getAgentOpsWorkflow('review')
    const [compatibility] = evaluateTeamOpsRuntimeCompatibility({
      workflow: review,
      candidates: [{ profileId: 'c2a_autonomous', engine: 'lucid' }],
    })

    expect(compatibility.compatible).toBe(false)
    expect(compatibility.missingCapabilities).toContain('runtime:lucid')
  })

  it('allows Hermes and OpenClaw through compatibility metadata without engine forks', () => {
    const review = getAgentOpsWorkflow('review')
    const compatibility = evaluateTeamOpsRuntimeCompatibility({
      workflow: review,
      candidates: [
        { profileId: 'c2a_autonomous', engine: 'hermes' },
        { profileId: 'c2a_autonomous', engine: 'openclaw' },
      ],
    })

    expect(compatibility.every((item) => item.compatible)).toBe(true)
    expect(compatibility.flatMap((item) => item.missingCapabilities)).not.toContain('runtime:hermes')
    expect(compatibility.flatMap((item) => item.missingCapabilities)).not.toContain('runtime:openclaw')
  })

  it('honors workflow runtime-mode requirements without adding product-level engine forks', () => {
    const workflow = {
      ...getAgentOpsWorkflow('review'),
      compatibleRuntimeModes: ['managed_dedicated' as const],
    }
    const compatibility = evaluateTeamOpsRuntimeCompatibility({ workflow })

    expect(compatibility.find((item) => item.profile.id === 'c1_managed')?.compatible).toBe(true)
    expect(compatibility.find((item) => item.profile.id === 'shared')?.compatible).toBe(false)
    expect(compatibility.find((item) => item.profile.id === 'c2a_autonomous')?.compatible).toBe(false)
  })

  it('can route by runtime-advertised native capabilities instead of engine name', () => {
    const workflow = {
      ...getAgentOpsWorkflow('review'),
      requiredCapabilities: ['native:kanban'],
    }

    const compatibility = evaluateTeamOpsRuntimeCompatibility({
      workflow,
      candidates: [
        {
          profileId: 'c2a_autonomous',
          engine: 'hermes',
          label: 'Hermes local agent',
          nativeCapabilities: [{
            id: 'hermes.kanban',
            kind: 'kanban',
            label: 'Hermes native Kanban projection',
            availability: 'limited',
            supportLevel: 'experimental',
          }],
        },
        {
          profileId: 'c2a_autonomous',
          engine: 'openclaw',
          label: 'OpenClaw local agent',
          nativeCapabilities: [{
            id: 'openclaw.native_channels',
            kind: 'native_channels',
            label: 'Native channels',
            availability: 'available',
            supportLevel: 'stable',
          }],
        },
      ],
    })

    expect(compatibility[0]).toMatchObject({
      compatible: true,
      supportLevel: 'partial',
      partialCapabilities: ['native:kanban'],
    })
    expect(compatibility[1]).toMatchObject({
      compatible: false,
      missingCapabilities: ['native:kanban'],
    })
  })

  it('uses the dispatch ladder for planning, DAG, approval, and tool-backed workflows', () => {
    expect(chooseTeamOpsDispatchTier(getAgentOpsWorkflow('autoplan')).tier).toBe('plan')
    expect(chooseTeamOpsDispatchTier(getAgentOpsWorkflow('review')).tier).toBe('heavy')
    expect(chooseTeamOpsDispatchTier(getAgentOpsWorkflow('ship')).tier).toBe('full')
    expect(chooseTeamOpsDispatchTier(getAgentOpsWorkflow('office-hours')).tier).toBe('medium')
    expect(chooseTeamOpsDispatchTier(getAgentOpsWorkflow('plan-ceo-review')).tier).toBe('simple')
  })

  it('keeps channel launch/report checks separate from runtime compatibility', () => {
    const qa = getAgentOpsWorkflow('qa')
    const discord = evaluateTeamOpsChannelLaunchCompatibility({ workflow: qa, channelId: 'discord' })
    const whatsapp = evaluateTeamOpsChannelLaunchCompatibility({ workflow: qa, channelId: 'whatsapp' })

    expect(discord.launchSupported).toBe(true)
    expect(discord.reportSupported).toBe(true)
    expect(whatsapp.launchSupported).toBe(true)
    expect(whatsapp.reportSupported).toBe(true)
  })

  it('keeps specialist slugs globally unique', () => {
    const slugs = listTeamOpsSpecialistProfiles().map((specialist) => specialist.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('returns a frozen dispatch plan projection for safe API reuse', () => {
    const plan = buildTeamOpsDispatchPlan({ workflow: getAgentOpsWorkflow('security-audit') })

    expect(Object.isFrozen(plan)).toBe(true)
    expect(plan.specialists.map((specialist) => specialist.slug)).toContain('red-team')
  })

  it('uses policy signals to adapt dispatch tier without engine-specific branching', () => {
    const plan = buildTeamOpsDispatchPlan({
      workflow: getAgentOpsWorkflow('plan-ceo-review'),
      teamPolicyEvaluation: {
        allowed: true,
        enforced: false,
        targetGates: ['ship'],
        required: [],
        recommended: [{
          workflowId: 'qa',
          level: 'recommended',
          gateTargets: ['ship'],
          freshnessHours: 72,
          satisfied: false,
          lastRunId: null,
          lastRunAt: null,
          reason: 'No completed QA run found.',
        }],
        optional: [],
        missingRequired: [],
        summary: 'Recommended QA is missing.',
      },
    })

    expect(plan.tier).toBe('heavy')
    expect(plan.adaptiveDispatch).toMatchObject({
      enabled: true,
      baseTier: 'simple',
      finalTier: 'heavy',
      policySignals: expect.arrayContaining([
        expect.stringContaining('Recommended workflow evidence'),
      ]),
    })
  })

  it('protects security, data migration, auth, billing, and privacy guardrails from adaptive skipping', () => {
    const review = getAgentOpsWorkflow('review')
    const plan = buildTeamOpsDispatchPlan({
      workflow: review,
      specialistTelemetry: [
        {
          slug: 'security',
          name: 'Security Reviewer',
          category: 'security',
          critical: true,
          selectedCount: 8,
          runCount: 8,
          completedRunCount: 8,
          failedRunCount: 0,
          blockedRunCount: 0,
          findingCount: 0,
          openCount: 0,
          acceptedCount: 0,
          fixedCount: 0,
          dismissedCount: 0,
          needsInfoCount: 0,
          usefulFindingCount: 0,
          falsePositiveCount: 0,
          criticalFindingCount: 0,
          highSeverityFindingCount: 0,
          avgConfidence: null,
          usefulnessRate: null,
          avgLatencyMs: null,
          totalCostUsd: 0,
          totalTokens: 0,
          lastSeenAt: '2026-04-30T10:00:00.000Z',
          signal: 'needs_tuning',
          recommendation: 'Would normally tune.',
        },
        {
          slug: 'testing',
          name: 'Testing Reviewer',
          category: 'testing',
          critical: false,
          selectedCount: 8,
          runCount: 8,
          completedRunCount: 8,
          failedRunCount: 0,
          blockedRunCount: 0,
          findingCount: 0,
          openCount: 0,
          acceptedCount: 0,
          fixedCount: 0,
          dismissedCount: 0,
          needsInfoCount: 0,
          usefulFindingCount: 0,
          falsePositiveCount: 0,
          criticalFindingCount: 0,
          highSeverityFindingCount: 0,
          avgConfidence: null,
          usefulnessRate: null,
          avgLatencyMs: null,
          totalCostUsd: 0,
          totalTokens: 0,
          lastSeenAt: '2026-04-30T10:00:00.000Z',
          signal: 'needs_tuning',
          recommendation: 'Review testing prompt before expanding usage.',
        },
      ],
    })

    expect(plan.specialists.map((specialist) => specialist.slug)).toContain('security')
    expect(plan.specialists.map((specialist) => specialist.slug)).not.toContain('testing')
    expect(plan.adaptiveDispatch.protectedSpecialists).toEqual([
      expect.objectContaining({ slug: 'security' }),
    ])
    expect(plan.adaptiveDispatch.skippedSpecialists).toEqual([
      expect.objectContaining({ slug: 'testing' }),
    ])
  })
})
