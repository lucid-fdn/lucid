import { describe, expect, it } from 'vitest'

import { evaluateNativeSchedulerDecision } from '../native-scheduler-contract.js'

describe('native scheduler contract', () => {
  it('keeps Lucid as the default scheduler source of truth', () => {
    const decision = evaluateNativeSchedulerDecision({ requestedMode: 'disabled' })

    expect(decision.allowed).toBe(true)
    expect(decision.executionDelegated).toBe(false)
    expect(decision.requiredCapabilities).toEqual([])
  })

  it('allows observe/import only when runtime advertises the stable facet contract', () => {
    const decision = evaluateNativeSchedulerDecision({
      requestedMode: 'import',
      capabilities: [
        { id: 'scheduled.native_scheduler.observe', supportLevel: 'experimental', availability: 'available' },
        { id: 'scheduled.native_scheduler.import', supportLevel: 'experimental', availability: 'available' },
      ],
    })

    expect(decision.allowed).toBe(true)
    expect(decision.executionDelegated).toBe(false)
  })

  it('blocks supported delegation without ACK/reconcile/idempotency proof', () => {
    const decision = evaluateNativeSchedulerDecision({
      requestedMode: 'delegate_supported',
      capabilities: [
        { id: 'scheduled.native_scheduler.delegate', supportLevel: 'stable', availability: 'available' },
      ],
    })

    expect(decision.allowed).toBe(false)
    expect(decision.executionDelegated).toBe(false)
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'Missing runtime capability: scheduled.ack',
      'Missing runtime capability: scheduled.reconcile',
      'Missing runtime capability: scheduled.idempotency',
    ]))
  })

  it('delegates only when the full native scheduler contract is present', () => {
    const capabilities = [
      { id: 'scheduled.native_scheduler.delegate', supportLevel: 'stable', availability: 'available' },
      { id: 'scheduled.ack', supportLevel: 'stable', availability: 'available' },
      { id: 'scheduled.reconcile', supportLevel: 'stable', availability: 'available' },
      { id: 'scheduled.idempotency', supportLevel: 'stable', availability: 'available' },
    ]

    expect(evaluateNativeSchedulerDecision({ requestedMode: 'delegate_supported', capabilities })).toEqual(expect.objectContaining({
      allowed: true,
      executionDelegated: true,
    }))
  })
})
