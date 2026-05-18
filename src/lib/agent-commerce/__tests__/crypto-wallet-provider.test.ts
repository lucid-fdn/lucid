import { describe, expect, it } from 'vitest'
import type { AgentSpendRequest } from '@contracts/agent-commerce'
import { AgentCommerceError } from '../errors'
import {
  assertCryptoWalletExecutionAllowed,
  CRYPTO_WALLET_PROVIDER_MANIFEST,
  isCryptoWalletExecutionEnabled,
} from '../providers/crypto-wallet'

const ORG_ID = '00000000-0000-4000-8000-000000000001'
const ASSISTANT_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000003'
const SPEND_REQUEST_ID = '00000000-0000-4000-8000-000000000010'

const EXECUTION_ENV = {
  AGENT_COMMERCE_CRYPTO_WALLET_ENABLED: 'true',
  AGENT_COMMERCE_LUCID_L2_EXECUTION_ENABLED: 'true',
  AGENT_COMMERCE_LUCID_L2_P0_GATES_CLOSED: 'true',
  AGENT_COMMERCE_LUCID_L2_SECURITY_REVIEW_REF: 'SEC-2026-05-02',
}

function spendRequest(overrides: Partial<AgentSpendRequest> = {}): AgentSpendRequest {
  return {
    id: SPEND_REQUEST_ID,
    contract_version: '2026-05-01',
    schema_version: 1,
    provider: 'crypto_wallet',
    rail: 'crypto_wallet_transfer',
    org_id: ORG_ID,
    assistant_id: ASSISTANT_ID,
    run_id: 'run-crypto',
    status: 'approved',
    merchant: {
      name: 'Onchain supplier',
      domain: 'supplier.example',
      country: 'US',
    },
    amount: {
      amount: 5000,
      currency: 'usd',
    },
    context: 'Pay an approved onchain supplier.',
    policy: {
      max_amount: {
        amount: 5000,
        currency: 'usd',
      },
      allowed_currencies: ['usd'],
      allowed_merchant_domains: ['supplier.example'],
      blocked_merchant_domains: [],
      allowed_providers: ['crypto_wallet'],
      allowed_rails: ['crypto_wallet_transfer'],
      requires_human_approval: true,
      allow_preview_providers: true,
      allow_free_on_provider_outage: false,
    },
    approval_required: true,
    approved_by: USER_ID,
    approved_at: '2026-05-01T10:00:00.000Z',
    created_at: '2026-05-01T09:00:00.000Z',
    updated_at: '2026-05-01T10:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

describe('crypto wallet Agent Commerce guard', () => {
  it('keeps the provider manifest disabled by default', () => {
    expect(CRYPTO_WALLET_PROVIDER_MANIFEST.availability.mode).toBe('disabled')
    expect(isCryptoWalletExecutionEnabled({})).toBe(false)
  })

  it('returns an internal-only execution plan for an explicitly approved spend request', () => {
    const plan = assertCryptoWalletExecutionAllowed({
      spendRequest: spendRequest(),
      requestedAmount: {
        amount: 4200,
        currency: 'usd',
      },
      env: {
        ...EXECUTION_ENV,
      },
      now: new Date('2026-05-01T11:00:00.000Z'),
    })

    expect(plan).toMatchObject({
      provider: 'crypto_wallet',
      rail: 'crypto_wallet_transfer',
      spend_request_id: SPEND_REQUEST_ID,
      org_id: ORG_ID,
      assistant_id: ASSISTANT_ID,
      execution_surface: 'internal_trading_agent_wallet',
      signer_surface: 'session_signer_internal_only',
      requires_internal_wallet_execution: true,
    })
    expect(JSON.stringify(plan)).not.toMatch(/privy|secret|private_key|signature/i)
  })

  it('fails closed unless the env gate is explicitly enabled', () => {
    expect(() => assertCryptoWalletExecutionAllowed({
      spendRequest: spendRequest(),
      env: {},
    })).toThrow(AgentCommerceError)
  })

  it('keeps wallet execution blocked until Lucid-L2 P0 gates are closed', () => {
    expect(() => assertCryptoWalletExecutionAllowed({
      spendRequest: spendRequest(),
      env: {
        AGENT_COMMERCE_CRYPTO_WALLET_ENABLED: 'true',
      },
    })).toThrow(/Lucid-L2 execution remains blocked/)
  })

  it('requires a recorded human approval before wallet execution', () => {
    expect(() => assertCryptoWalletExecutionAllowed({
      spendRequest: spendRequest({
        approved_by: undefined,
        approved_at: undefined,
      }),
      env: {
        ...EXECUTION_ENV,
      },
    })).toThrow(/recorded human approval/)
  })

  it('requires explicit crypto wallet provider and rail policy', () => {
    expect(() => assertCryptoWalletExecutionAllowed({
      spendRequest: spendRequest({
        policy: {
          max_amount: {
            amount: 5000,
            currency: 'usd',
          },
          allowed_currencies: ['usd'],
          allowed_merchant_domains: ['supplier.example'],
          blocked_merchant_domains: [],
          allowed_providers: [],
          allowed_rails: [],
          requires_human_approval: true,
          allow_preview_providers: true,
          allow_free_on_provider_outage: false,
        },
      }),
      env: {
        ...EXECUTION_ENV,
      },
    })).toThrow(/explicit crypto_wallet provider policy/)
  })

  it('rejects transaction value above the approved spend budget', () => {
    expect(() => assertCryptoWalletExecutionAllowed({
      spendRequest: spendRequest(),
      requestedAmount: {
        amount: 5001,
        currency: 'usd',
      },
      env: {
        ...EXECUTION_ENV,
      },
    })).toThrow(/exceeds the approved spend request/)
  })
})
