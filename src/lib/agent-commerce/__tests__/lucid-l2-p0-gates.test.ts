import { describe, expect, it } from 'vitest'
import { AgentCommerceError } from '../errors'
import {
  assertLucidL2P0ExecutionGate,
  getLucidL2P0GateState,
  LUCID_L2_EXECUTION_ENABLED_ENV,
  LUCID_L2_P0_GATE_IDS,
  LUCID_L2_P0_GATES_CLOSED_ENV,
  LUCID_L2_SECURITY_REVIEW_REF_ENV,
} from '../lucid-l2-p0-gates'

const CLOSED_ENV = {
  [LUCID_L2_EXECUTION_ENABLED_ENV]: 'true',
  [LUCID_L2_P0_GATES_CLOSED_ENV]: 'true',
  [LUCID_L2_SECURITY_REVIEW_REF_ENV]: 'SEC-2026-05-02',
}

describe('Lucid-L2 P0 execution gates', () => {
  it('fails closed by default with every P0 gate open', () => {
    const state = getLucidL2P0GateState({})

    expect(state).toMatchObject({
      executionEnabled: false,
      p0GatesClosed: false,
      allClosed: false,
      openGates: [...LUCID_L2_P0_GATE_IDS],
    })
  })

  it('throws a provider unavailable error with gate evidence details', () => {
    let error: unknown
    try {
      assertLucidL2P0ExecutionGate({
        env: {},
        surface: 'crypto_wallet_transfer',
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(AgentCommerceError)
    expect(error).toMatchObject({
      code: 'provider_unavailable',
      status: 503,
      details: {
        reason_code: 'lucid_l2_gate_open',
        surface: 'crypto_wallet_transfer',
        open_gates: [...LUCID_L2_P0_GATE_IDS],
        required_env: [
          LUCID_L2_EXECUTION_ENABLED_ENV,
          LUCID_L2_P0_GATES_CLOSED_ENV,
          LUCID_L2_SECURITY_REVIEW_REF_ENV,
        ],
      },
    })
  })

  it('allows execution only when enablement, closure, and review evidence are all present', () => {
    expect(() => assertLucidL2P0ExecutionGate({
      env: CLOSED_ENV,
      surface: 'crypto_wallet_transfer',
    })).not.toThrow()

    expect(getLucidL2P0GateState(CLOSED_ENV)).toMatchObject({
      allClosed: true,
      openGates: [],
      securityReviewRef: 'SEC-2026-05-02',
    })
  })

  it('does not treat booleans alone as sufficient evidence', () => {
    expect(() => assertLucidL2P0ExecutionGate({
      env: {
        [LUCID_L2_EXECUTION_ENABLED_ENV]: 'true',
        [LUCID_L2_P0_GATES_CLOSED_ENV]: 'true',
      },
      surface: 'crypto_wallet_transfer',
    })).toThrow(/Lucid-L2 execution remains blocked/)
  })
})
