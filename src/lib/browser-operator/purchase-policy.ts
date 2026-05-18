import crypto from 'crypto'
import {
  BrowserOperatorPurchaseCartItemSchema,
  BrowserOperatorPurchasePolicySchema,
  type BrowserOperatorApprovalState,
  type BrowserOperatorPurchaseCartItem,
  type BrowserOperatorPurchasePolicy,
} from '@contracts/browser-operator'
import {
  AgentCommerceMerchantSchema,
  type AgentCommerceMerchantInput,
} from '@contracts/agent-commerce'

export interface BrowserOperatorPurchasePolicyDecision {
  allowed: boolean
  approvalState: BrowserOperatorApprovalState
  reasonCodes: string[]
  cartHash: string
  cartTotal: { amount: number; currency: string } | null
  evidence: Record<string, unknown>
}

export function evaluateBrowserOperatorPurchasePolicy(input: {
  policy: BrowserOperatorPurchasePolicy
  merchant: AgentCommerceMerchantInput
  cartItems: BrowserOperatorPurchaseCartItem[]
  now?: Date
}): BrowserOperatorPurchasePolicyDecision {
  const policy = BrowserOperatorPurchasePolicySchema.parse(input.policy)
  const merchant = AgentCommerceMerchantSchema.parse(input.merchant)
  const cartItems = input.cartItems.map((item) => BrowserOperatorPurchaseCartItemSchema.parse(item))
  const now = input.now ?? new Date()
  const reasonCodes: string[] = []
  const cartTotal = summarizeCartTotal(cartItems)
  const cartHash = hashBrowserOperatorCart(cartItems)
  const domain = normalizeDomain(merchant.domain ?? merchant.url)

  if (policy.status !== 'active') reasonCodes.push(`policy_${policy.status}`)
  if (policy.expires_at && new Date(policy.expires_at).getTime() <= now.getTime()) {
    reasonCodes.push('policy_expired')
  }

  if (domain && policy.blocked_merchant_domains.some((candidate) => domainMatches(domain, candidate))) {
    reasonCodes.push('merchant_blocked')
  }
  if (policy.allowed_merchant_domains.length > 0) {
    if (!domain) reasonCodes.push('merchant_domain_required')
    else if (!policy.allowed_merchant_domains.some((candidate) => domainMatches(domain, candidate))) {
      reasonCodes.push('merchant_not_allowed')
    }
  }

  if (policy.max_item_count && cartItems.length > policy.max_item_count) {
    reasonCodes.push('cart_item_count_exceeded')
  }

  for (const item of cartItems) {
    const category = item.category?.trim().toLowerCase()
    if (!category) continue
    if (policy.blocked_categories.map(normalizeLabel).includes(category)) {
      reasonCodes.push('category_blocked')
    }
    if (policy.allowed_categories.length > 0 && !policy.allowed_categories.map(normalizeLabel).includes(category)) {
      reasonCodes.push('category_not_allowed')
    }
    if (item.substitution_for && !policy.allow_substitutions) {
      reasonCodes.push('substitution_not_allowed')
    }
  }

  if (policy.max_total && cartTotal) {
    if (policy.max_total.currency.toLowerCase() !== cartTotal.currency.toLowerCase()) {
      reasonCodes.push('currency_mismatch')
    } else if (cartTotal.amount > policy.max_total.amount) {
      reasonCodes.push('max_total_exceeded')
    }
  }

  const uniqueReasons = Array.from(new Set(reasonCodes))
  const allowed = uniqueReasons.length === 0
  const approvalState: BrowserOperatorApprovalState = !allowed
    ? 'blocked'
    : policy.auto_approve_inside_policy && !policy.requires_human_approval
      ? 'not_required'
      : 'required'

  return {
    allowed,
    approvalState,
    reasonCodes: uniqueReasons,
    cartHash,
    cartTotal,
    evidence: {
      merchant_domain: domain,
      item_count: cartItems.length,
      max_item_count: policy.max_item_count ?? null,
      max_total: policy.max_total ?? null,
      auto_approve_inside_policy: policy.auto_approve_inside_policy,
      requires_human_approval: policy.requires_human_approval,
    },
  }
}

export function summarizeCartTotal(
  cartItems: BrowserOperatorPurchaseCartItem[],
): { amount: number; currency: string } | null {
  const totals = new Map<string, number>()
  for (const item of cartItems) {
    const parsed = BrowserOperatorPurchaseCartItemSchema.parse(item)
    const amount = parsed.total_price ?? (
      parsed.unit_price != null ? parsed.unit_price * parsed.quantity : 0
    )
    if (!Number.isFinite(amount) || amount <= 0) continue
    const cents = Math.round(amount * 100)
    totals.set(parsed.currency, (totals.get(parsed.currency) ?? 0) + cents)
  }
  const entries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  return { currency: entries[0][0], amount: entries[0][1] }
}

export function hashBrowserOperatorCart(cartItems: BrowserOperatorPurchaseCartItem[]): string {
  const normalized = cartItems
    .map((item) => BrowserOperatorPurchaseCartItemSchema.parse(item))
    .map((item) => ({
      merchant_item_id: item.merchant_item_id ?? null,
      name: item.name.trim().toLowerCase(),
      quantity: item.quantity,
      unit: item.unit?.trim().toLowerCase() ?? null,
      unit_price: item.unit_price ?? null,
      total_price: item.total_price ?? null,
      currency: item.currency.toLowerCase(),
      category: item.category?.trim().toLowerCase() ?? null,
      substitution_for: item.substitution_for ?? null,
    }))
    .sort((a, b) => `${a.merchant_item_id ?? ''}:${a.name}`.localeCompare(`${b.merchant_item_id ?? ''}:${b.name}`))

  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
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

function domainMatches(domain: string, candidate: string): boolean {
  const normalized = normalizeDomain(candidate)
  if (!normalized) return false
  return domain === normalized || domain.endsWith(`.${normalized}`)
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase()
}
