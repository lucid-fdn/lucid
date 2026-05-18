import { describe, expect, it } from 'vitest'

import { resolveAgentOpsRunModePolicy } from '../run-modes'
import { getAgentOpsWorkflow } from '../workflow-registry'

const baseInput = {
  orgId: '11111111-1111-4111-8111-111111111111',
  workflowId: 'review' as const,
  scope: { type: 'project' as const, ref: 'lucid', metadata: {} },
  input: {},
  metadata: {},
}

describe('Agent Ops run modes', () => {
  it('keeps plan-only runs mutation-free even for approval-gated workflows', () => {
    const workflow = getAgentOpsWorkflow('ship')
    const policy = resolveAgentOpsRunModePolicy({
      requestedMode: 'plan_only',
      workflow,
      runInput: { ...baseInput, workflowId: 'ship', scope: { type: 'project', metadata: {} } },
    })

    expect(policy.effectiveMode).toBe('plan_only')
    expect(policy.allowedMutations).toEqual([])
    expect(policy.antiShortcutApplied).toBe(true)
    expect(policy.requiredQuestions.map((question) => question.id)).toContain('confirm-goal')
  })

  it('records blocked mode before runtime dispatch', () => {
    const workflow = getAgentOpsWorkflow('review')
    const policy = resolveAgentOpsRunModePolicy({
      requestedMode: 'execute',
      workflow,
      runInput: baseInput,
      blockedReason: 'No compatible runtime is currently available.',
    })

    expect(policy.effectiveMode).toBe('blocked')
    expect(policy.reason).toContain('No compatible runtime')
    expect(policy.allowedMutations).toEqual([])
  })

  it('keeps read-only execute runs safe without engine-specific branching', () => {
    const workflow = getAgentOpsWorkflow('check-page')
    const policy = resolveAgentOpsRunModePolicy({
      requestedMode: 'execute',
      workflow,
      runInput: { ...baseInput, workflowId: 'check-page', scope: { type: 'url', ref: 'https://example.com', metadata: {} } },
    })

    expect(policy.effectiveMode).toBe('execute')
    expect(policy.allowedMutations).toEqual([])
    expect(policy.reason).toContain('read-only')
  })
})
