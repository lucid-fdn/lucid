import {
  AgentCommerceMerchantSchema,
  AgentCommerceMoneySchema,
  AgentCommercePolicySchema,
  type AgentCommerceMerchant,
  type AgentCommerceMerchantInput,
  type AgentCommerceMoneyInput,
  type AgentCommercePolicyInput,
  type RailPolicyReasonCode,
} from '@contracts/agent-commerce'

export interface AgentCommercePolicyDecision {
  allowed: boolean
  reason?: string
  reasonCode?: RailPolicyReasonCode
}

function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^www\./, '')
  }
}

function merchantDomain(merchant: AgentCommerceMerchant): string | null {
  return normalizeDomain(merchant.domain) ?? normalizeDomain(merchant.url)
}

function domainMatches(domain: string, candidate: string): boolean {
  const normalized = normalizeDomain(candidate)
  if (!normalized) return false
  return domain === normalized || domain.endsWith(`.${normalized}`)
}

export function evaluateAgentCommercePolicy(input: {
  amount: AgentCommerceMoneyInput
  merchant: AgentCommerceMerchantInput
  policy?: AgentCommercePolicyInput
  now?: Date
}): AgentCommercePolicyDecision {
  const amount = AgentCommerceMoneySchema.parse(input.amount)
  const merchant = AgentCommerceMerchantSchema.parse(input.merchant)
  const policy = AgentCommercePolicySchema.parse(input.policy ?? {})
  const now = input.now ?? new Date()

  if (policy.expires_at && new Date(policy.expires_at).getTime() <= now.getTime()) {
    return { allowed: false, reason: 'Agent commerce policy is expired.', reasonCode: 'policy_denied' }
  }

  if (policy.allowed_currencies.length > 0) {
    const allowed = new Set(policy.allowed_currencies.map((currency) => currency.toLowerCase()))
    if (!allowed.has(amount.currency.toLowerCase())) {
      return { allowed: false, reason: `Currency ${amount.currency} is not allowed.`, reasonCode: 'currency_not_allowed' }
    }
  }

  if (policy.max_amount) {
    const max = AgentCommerceMoneySchema.parse(policy.max_amount)
    if (max.currency.toLowerCase() !== amount.currency.toLowerCase()) {
      return { allowed: false, reason: 'Spend currency does not match policy max amount currency.', reasonCode: 'currency_not_allowed' }
    }
    if (amount.amount > max.amount) {
      return { allowed: false, reason: 'Spend request exceeds policy max amount.', reasonCode: 'amount_exceeds_limit' }
    }
  }

  const domain = merchantDomain(merchant)
  if (domain && policy.blocked_merchant_domains.some((candidate) => domainMatches(domain, candidate))) {
    return { allowed: false, reason: 'Merchant domain is blocked.', reasonCode: 'merchant_blocked' }
  }

  if (policy.allowed_merchant_domains.length > 0) {
    if (!domain) return { allowed: false, reason: 'Merchant domain is required by policy.', reasonCode: 'merchant_domain_required' }
    if (!policy.allowed_merchant_domains.some((candidate) => domainMatches(domain, candidate))) {
      return { allowed: false, reason: 'Merchant domain is not allowed.', reasonCode: 'merchant_blocked' }
    }
  }

  return { allowed: true }
}

export function shouldRequireHumanApproval(policy?: AgentCommercePolicyInput): boolean {
  return AgentCommercePolicySchema.parse(policy ?? {}).requires_human_approval
}
