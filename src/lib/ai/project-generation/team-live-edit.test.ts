import { describe, expect, it } from 'vitest'

import type { GenerationDraft } from './schemas'

import { buildTeamDraftApplyPlan, mapCrewEdgesToRoleHandoffs } from './team-live-edit'

describe('team-live-edit', () => {
  it('builds a live apply plan for a compatible team draft', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: {
        name: 'Customer Escalation',
        description: 'Handles escalations',
      },
      starterName: 'Escalation Team',
      team: {
        kind: 'team',
        objective: 'Resolve escalations quickly',
        members: [
          { role: 'triage', is_coordinator: true, system_prompt: 'Lead intake' },
          { role: 'resolver', system_prompt: 'Resolve issues' },
        ],
        edges: [{ from: 'triage', to: 'resolver', label: 'handoff' }],
      },
    }

    const result = buildTeamDraftApplyPlan({
      draft,
      members: [
        { id: 'member-2', join_order: 1, role: 'old-resolver' },
        { id: 'member-1', join_order: 0, role: 'old-triage' },
      ],
    })

    expect(result.reason).toBeUndefined()
    expect(result.plan).toEqual({
      crew: {
        name: 'Escalation Team',
        description: 'Handles escalations',
        objective: 'Resolve escalations quickly',
      },
      memberUpdates: [
        { memberId: 'member-1', currentRole: 'old-triage', role: 'triage', isCoordinator: true },
        { memberId: 'member-2', currentRole: 'old-resolver', role: 'resolver', isCoordinator: false },
      ],
      memberAdditions: [],
      memberRemovals: [],
      edges: [
        {
          fromRole: 'triage',
          toRole: 'resolver',
          label: 'handoff',
        },
      ],
    })
  })

  it('captures additions and removals when team size changes', () => {
    const draft: GenerationDraft = {
      version: '1.0',
      mode: 'blank-team',
      project: { name: 'Ops' },
      team: {
        kind: 'team',
        objective: 'Run ops',
        members: [
          { role: 'lead', is_coordinator: true, system_prompt: 'Lead ops' },
          { role: 'operator', system_prompt: 'Run ops' },
          { role: 'reviewer', system_prompt: 'Review ops' },
        ],
        edges: [],
      },
    }

    const result = buildTeamDraftApplyPlan({
      draft,
      members: [
        { id: 'member-1', join_order: 0, role: 'lead' },
        { id: 'member-2', join_order: 1, role: 'operator' },
      ],
    })

    expect(result.reason).toBeUndefined()
    expect(result.plan?.memberUpdates).toHaveLength(2)
    expect(result.plan?.memberAdditions).toEqual([
      { role: 'reviewer', isCoordinator: false },
    ])
    expect(result.plan?.memberRemovals).toEqual([])
  })

  it('maps current crew edges back into role handoffs for draft projection', () => {
    const handoffs = mapCrewEdgesToRoleHandoffs({
      members: [
        { id: 'member-1', role: 'triage', join_order: 0 },
        { id: 'member-2', role: 'resolver', join_order: 1 },
      ],
      edges: [
        { source_member_id: 'member-1', target_member_id: 'member-2', label: 'escalate' },
      ],
    })

    expect(handoffs).toEqual([
      { from: 'triage', to: 'resolver', label: 'escalate' },
    ])
  })
})
