import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsTeamPolicyBlockedReason,
  evaluateAgentOpsTeamPolicyGate,
  resolveAgentOpsTeamPolicy,
} from '../team-policy'
import { getAgentOpsWorkflow } from '../workflow-registry'

describe('Agent Ops Team Policy', () => {
  it('resolves required, recommended, and optional workflow policy from project metadata', () => {
    const policy = resolveAgentOpsTeamPolicy({
      team_policy: {
        workflows: [
          { workflow_id: 'review', level: 'required', gate_targets: ['ship', 'deploy'], freshness_hours: 168 },
          { workflow_id: 'qa', level: 'recommended', gate_targets: ['ship'], freshness_hours: 72 },
          { workflow_id: 'retro', level: 'optional', gate_targets: [] },
        ],
      },
    })

    expect(policy.workflows).toEqual([
      expect.objectContaining({ workflowId: 'qa', level: 'recommended', gateTargets: ['ship'] }),
      expect.objectContaining({ workflowId: 'retro', level: 'optional', gateTargets: [] }),
      expect.objectContaining({ workflowId: 'review', level: 'required', gateTargets: ['deploy', 'ship'] }),
    ])
  })

  it('blocks ship when required evidence workflows are missing', () => {
    const evaluation = evaluateAgentOpsTeamPolicyGate({
      policy: resolveAgentOpsTeamPolicy({
        team_policy: {
          workflows: [
            { workflow_id: 'review', level: 'required', gate_targets: ['ship'], freshness_hours: 168 },
            { workflow_id: 'qa', level: 'recommended', gate_targets: ['ship'], freshness_hours: 72 },
          ],
        },
      }),
      workflow: getAgentOpsWorkflow('ship'),
      scope: { type: 'branch', ref: 'release/agent-ops', metadata: {} },
      completedRuns: [],
      now: new Date('2026-04-30T12:00:00.000Z'),
    })

    expect(evaluation).toMatchObject({
      allowed: false,
      enforced: true,
      targetGates: ['deploy', 'ship'],
      missingRequired: [expect.objectContaining({
        workflowId: 'review',
        reason: 'No completed review run found for this project.',
      })],
    })
    expect(buildAgentOpsTeamPolicyBlockedReason(evaluation)).toContain('review')
  })

  it('allows ship when required workflows are fresh and keeps recommended signals non-blocking', () => {
    const evaluation = evaluateAgentOpsTeamPolicyGate({
      policy: resolveAgentOpsTeamPolicy({
        team_policy: {
          workflows: [
            { workflow_id: 'review', level: 'required', gate_targets: ['ship'], freshness_hours: 168 },
            { workflow_id: 'qa', level: 'recommended', gate_targets: ['ship'], freshness_hours: 1 },
          ],
        },
      }),
      workflow: getAgentOpsWorkflow('ship'),
      scope: { type: 'branch', ref: 'release/agent-ops', metadata: {} },
      completedRuns: [
        {
          id: 'run-review',
          workflowId: 'review',
          status: 'completed',
          scope: { type: 'pull_request', ref: 'pr-42', metadata: {} },
          completedAt: '2026-04-30T10:00:00.000Z',
          updatedAt: '2026-04-30T10:00:00.000Z',
          createdAt: '2026-04-30T09:00:00.000Z',
        },
      ],
      now: new Date('2026-04-30T12:00:00.000Z'),
    })

    expect(evaluation.allowed).toBe(true)
    expect(evaluation.required[0]).toMatchObject({ workflowId: 'review', satisfied: true })
    expect(evaluation.recommended[0]).toMatchObject({ workflowId: 'qa', satisfied: false })
    expect(buildAgentOpsTeamPolicyBlockedReason(evaluation)).toBeNull()
  })
})
