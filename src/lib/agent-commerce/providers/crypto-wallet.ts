import {
  AgentCommercePolicySchema,
  type AgentCommerceMerchant,
  type AgentCommerceMoney,
  type AgentCommerceProviderManifest,
  type AgentSpendRequest,
} from '@contracts/agent-commerce'
import { AgentCommerceError } from '../errors'
import { assertLucidL2P0ExecutionGate } from '../lucid-l2-p0-gates'
import { evaluateAgentCommercePolicy } from '../policy'

export const CRYPTO_WALLET_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'crypto_wallet',
  label: 'Crypto wallet',
  roles: ['agent_platform'],
  capabilities: ['machine_payment', 'realtime_authorization'],
  rails: ['crypto_wallet_transfer'],
  requires_account_access: true,
  provider_version: 'policy-gated-internal-preview',
  availability: { mode: 'disabled', countries: [] },
}

export interface CryptoWalletExecutionGuardInput {
  spendRequest: AgentSpendRequest
  requestedAmount?: AgentCommerceMoney
  merchant?: AgentCommerceMerchant
  env?: Record<string, string | undefined>
  now?: Date
}

export interface CryptoWalletExecutionPlan {
  provider: 'crypto_wallet'
  rail: 'crypto_wallet_transfer'
  spend_request_id: string
  org_id: string
  assistant_id?: string
  run_id?: string
  amount: AgentCommerceMoney
  merchant: AgentCommerceMerchant
  execution_surface: 'internal_trading_agent_wallet'
  signer_surface: 'session_signer_internal_only'
  requires_internal_wallet_execution: true
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function isCryptoWalletExecutionEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return TRUE_VALUES.has((env.AGENT_COMMERCE_CRYPTO_WALLET_ENABLED ?? '').trim().toLowerCase())
}

function deny(
  code: AgentCommerceError['code'],
  message: string,
  status = 403,
  details?: Record<string, unknown>,
): never {
  throw new AgentCommerceError(code, message, status, { details })
}

function assertExplicitCryptoWalletPolicy(spendRequest: AgentSpendRequest): void {
  const policy = AgentCommercePolicySchema.parse(spendRequest.policy)
  if (!policy.allowed_providers.includes('crypto_wallet')) {
    deny(
      'policy_denied',
      'Crypto wallet execution requires an explicit crypto_wallet provider policy.',
      403,
      { reason_code: 'policy_denied', required_provider: 'crypto_wallet' },
    )
  }
  if (!policy.allowed_rails.includes('crypto_wallet_transfer')) {
    deny(
      'policy_denied',
      'Crypto wallet execution requires an explicit crypto_wallet_transfer rail policy.',
      403,
      { reason_code: 'policy_denied', required_rail: 'crypto_wallet_transfer' },
    )
  }
}

export function assertCryptoWalletExecutionAllowed(
  input: CryptoWalletExecutionGuardInput,
): CryptoWalletExecutionPlan {
  const { spendRequest, env = process.env, now = new Date() } = input

  if (!isCryptoWalletExecutionEnabled(env)) {
    deny(
      'provider_unavailable',
      'Crypto wallet execution is disabled for Agent Commerce.',
      503,
      { reason_code: 'provider_disabled', provider: 'crypto_wallet' },
    )
  }

  assertLucidL2P0ExecutionGate({
    env,
    surface: 'crypto_wallet_transfer',
  })

  if (spendRequest.provider !== 'crypto_wallet' || spendRequest.rail !== 'crypto_wallet_transfer') {
    deny(
      'policy_denied',
      'Spend request is not bound to the crypto wallet rail.',
      403,
      {
        reason_code: 'provider_capability_missing',
        spend_provider: spendRequest.provider,
        spend_rail: spendRequest.rail,
      },
    )
  }
  if (!['approved', 'credential_issued'].includes(spendRequest.status)) {
    deny(
      'invalid_state_transition',
      'Crypto wallet execution requires an approved spend request.',
      409,
      { reason_code: 'approval_required', spend_status: spendRequest.status },
    )
  }
  if (!spendRequest.approved_at || !spendRequest.approved_by) {
    deny(
      'invalid_state_transition',
      'Crypto wallet execution requires a recorded human approval.',
      409,
      { reason_code: 'approval_required' },
    )
  }
  if (spendRequest.expires_at && new Date(spendRequest.expires_at).getTime() <= now.getTime()) {
    deny(
      'invalid_state_transition',
      'Crypto wallet execution requires a non-expired spend request.',
      409,
      { reason_code: 'policy_denied', expired_at: spendRequest.expires_at },
    )
  }

  assertExplicitCryptoWalletPolicy(spendRequest)

  const requestedAmount = input.requestedAmount ?? spendRequest.amount
  if (requestedAmount.currency !== spendRequest.amount.currency) {
    deny(
      'policy_denied',
      'Crypto wallet execution amount currency does not match the approved spend request.',
      403,
      {
        reason_code: 'currency_not_allowed',
        expected_currency: spendRequest.amount.currency,
        requested_currency: requestedAmount.currency,
      },
    )
  }
  if (requestedAmount.amount > spendRequest.amount.amount) {
    deny(
      'policy_denied',
      'Crypto wallet execution amount exceeds the approved spend request.',
      403,
      {
        reason_code: 'amount_exceeds_limit',
        expected_amount: spendRequest.amount.amount,
        requested_amount: requestedAmount.amount,
      },
    )
  }

  const policyDecision = evaluateAgentCommercePolicy({
    amount: requestedAmount,
    merchant: input.merchant ?? spendRequest.merchant,
    policy: spendRequest.policy,
    now,
  })
  if (!policyDecision.allowed) {
    deny(
      'policy_denied',
      policyDecision.reason ?? 'Crypto wallet execution is denied by policy.',
      403,
      { reason_code: policyDecision.reasonCode ?? 'policy_denied' },
    )
  }

  return {
    provider: 'crypto_wallet',
    rail: 'crypto_wallet_transfer',
    spend_request_id: spendRequest.id,
    org_id: spendRequest.org_id,
    assistant_id: spendRequest.assistant_id,
    run_id: spendRequest.run_id,
    amount: requestedAmount,
    merchant: input.merchant ?? spendRequest.merchant,
    execution_surface: 'internal_trading_agent_wallet',
    signer_surface: 'session_signer_internal_only',
    requires_internal_wallet_execution: true,
  }
}
