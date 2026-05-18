import { describe, expect, it } from 'vitest'

import {
  evaluateDecisionPacing,
  listAgentOpsQuestionRegistry,
  serializeDecisionPacingForRuntime,
} from '../decision-pacing'

describe('Agent Ops decision pacing', () => {
  it('always interrupts for one-way safety doors', () => {
    const result = evaluateDecisionPacing({
      questionId: 'browser-mutation',
      preferredOptionId: 'block',
      usedTwoWayPrompts: 99,
      maxTwoWayPrompts: 0,
    })

    expect(result.mode).toBe('asked')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.reversible).toBe(false)
    expect(result.question.doorType).toBe('one_way')
  })

  it('auto-applies trusted preferences for two-way decisions', () => {
    const result = evaluateDecisionPacing({
      questionId: 'review-depth',
      preferredOptionId: 'fast',
    })

    expect(result.mode).toBe('auto_applied')
    expect(result.shouldInterrupt).toBe(false)
    expect(result.selectedOption.id).toBe('fast')
    expect(result.reversible).toBe(true)
  })

  it('records silent flippable decisions when the two-way prompt budget is exhausted', () => {
    const result = evaluateDecisionPacing({
      questionId: 'docs-copy-style',
      usedTwoWayPrompts: 2,
      maxTwoWayPrompts: 2,
    })

    expect(result.mode).toBe('silent_decision')
    expect(result.shouldInterrupt).toBe(false)
    expect(result.reversible).toBe(true)
    expect(result.budget.remainingTwoWayPrompts).toBe(0)
  })

  it('serializes a runtime-agnostic contract for DAG agents', () => {
    const contract = serializeDecisionPacingForRuntime()

    expect(contract).toMatchObject({
      schema_version: 1,
      event_table: 'agent_ops_decision_events',
      policy: {
        one_way_always_ask: true,
        two_way_budgeted: true,
        silent_decisions_visible: true,
        flip_supported: true,
      },
    })
    expect(contract.registry).toHaveLength(listAgentOpsQuestionRegistry().length)
  })
})
