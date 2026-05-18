import {
  isBrowserCheckoutAutonomousSupported,
  type BrowserCheckoutMoney,
} from '@lucid/browser-checkout-adapter'
import type {
  BrowserOperatorAccount,
  BrowserOperatorProfile,
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'
import type {
  BrowserOperatorCheckoutAdapter,
} from './checkout-adapters'
import { resolveBrowserOperatorProfileAffinity } from './profile-store'

export type BrowserOperatorCheckoutDryRunEvidence = {
  provider: string
  total?: BrowserCheckoutMoney
  itemCount?: number
  rawSignals: string[]
  riskReasons?: string[]
}

export type BrowserOperatorCheckoutReceiptEvidence = {
  provider: string
  orderId?: string
  orderName?: string
  confirmationNumber?: string
  receiptUrl?: string
  total?: BrowserCheckoutMoney
  rawSignals: string[]
}

export type BrowserOperatorCheckoutGateCheck = {
  id: string
  ok: boolean
  message: string
}

export type BrowserOperatorCheckoutStagingGateResult = {
  ok: boolean
  adapterId: string
  merchantDomain: string | null
  currentTier: string
  targetTier: 'live_supported'
  canPromoteStoreProfile: boolean
  checks: BrowserOperatorCheckoutGateCheck[]
  metadataPatch: Record<string, unknown>
}

export function evaluateBrowserOperatorCheckoutStagingGate(input: {
  adapter: BrowserOperatorCheckoutAdapter
  account: BrowserOperatorAccount
  profiles: BrowserOperatorProfile[]
  purchaseRun: BrowserOperatorPurchaseRun
  cartItems: BrowserOperatorPurchaseCartItem[]
  dryRun: BrowserOperatorCheckoutDryRunEvidence
  receipt: BrowserOperatorCheckoutReceiptEvidence
  verifiedAt?: string
}): BrowserOperatorCheckoutStagingGateResult {
  const checks: BrowserOperatorCheckoutGateCheck[] = []
  const push = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message })
  const profileAffinity = resolveBrowserOperatorProfileAffinity({
    account: input.account,
    profiles: input.profiles,
  })
  const merchantDomain = normalizeDomain(input.purchaseRun.merchant.domain ?? input.purchaseRun.merchant.url)
  const cartTotal = input.purchaseRun.cart_total ?? summarizeCartItems(input.cartItems)
  const cartQuantity = input.cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const dryRunTotalMatches = totalsMatch(cartTotal, input.dryRun.total)
  const receiptTotalMatches = totalsMatch(cartTotal, input.receipt.total)
  const adapterAlreadyAutonomous = isBrowserCheckoutAutonomousSupported(input.adapter.manifest)

  push('adapter_visible', input.adapter.canHandle({
    account: input.account,
    purchaseRun: input.purchaseRun,
    cartItems: input.cartItems,
  }), 'adapter matches merchant/account')
  push('merchant_domain_scoped', Boolean(merchantDomain), 'promotion is scoped to a concrete merchant domain')
  push('account_connected', input.account.auth_state === 'connected', 'merchant account is connected through takeover/session')
  push('profile_reusable', profileAffinity.usable, `profile affinity is ${profileAffinity.reason}`)
  push('profile_ref_present', Boolean(profileAffinity.profileRef || profileAffinity.contextRef || profileAffinity.artifactRef), 'profile/context/artifact ref is present')
  push('no_raw_credentials_required', !input.account.session_secret_ref, 'profile reuse does not require exposing raw credentials')
  push('dry_run_total_matches', dryRunTotalMatches, 'dry-run cart total matches purchase run total')
  push('dry_run_items_match', input.dryRun.itemCount == null || input.dryRun.itemCount === input.cartItems.length || input.dryRun.itemCount === cartQuantity, 'dry-run item count matches cart lines or quantity')
  push('dry_run_has_evidence', input.dryRun.rawSignals.length >= 2, 'dry-run captured enough cart evidence signals')
  push('dry_run_no_risky_blockers', (input.dryRun.riskReasons ?? []).length === 0, 'dry-run found no takeover/blocking risks')
  push('receipt_has_order_proof', Boolean(input.receipt.orderId || input.receipt.orderName || input.receipt.confirmationNumber), 'receipt has order identifier')
  push('receipt_has_url', Boolean(input.receipt.receiptUrl), 'receipt has URL/artifact pointer')
  push('receipt_total_matches', receiptTotalMatches, 'receipt total matches purchase run total')
  push('receipt_has_evidence', input.receipt.rawSignals.length >= 2, 'receipt captured enough proof signals')
  push('no_global_adapter_promotion', !adapterAlreadyAutonomous, 'promotion candidate is store/profile-scoped, not a global adapter flip')

  const ok = checks.every((check) => check.ok)
  const verifiedAt = input.verifiedAt ?? new Date().toISOString()
  const metadataPatch = ok
    ? {
        checkout_staging: {
          adapter_id: input.adapter.id,
          merchant_domain: merchantDomain,
          current_tier: input.adapter.manifest.reliability.tier,
          target_tier: 'live_supported',
          profile_affinity: {
            provider: profileAffinity.provider,
            reason: profileAffinity.reason,
            profile_ref: profileAffinity.profileRef ?? null,
            context_ref: profileAffinity.contextRef ?? null,
            artifact_ref: profileAffinity.artifactRef ?? null,
          },
          dry_run_provider: input.dryRun.provider,
          receipt_provider: input.receipt.provider,
          verified_at: verifiedAt,
          scope: 'store_profile',
        },
      }
    : {}

  return {
    ok,
    adapterId: input.adapter.id,
    merchantDomain,
    currentTier: input.adapter.manifest.reliability.tier,
    targetTier: 'live_supported',
    canPromoteStoreProfile: ok,
    checks,
    metadataPatch,
  }
}

function summarizeCartItems(cartItems: BrowserOperatorPurchaseCartItem[]): BrowserCheckoutMoney | null {
  const totals = new Map<string, number>()
  for (const item of cartItems) {
    const amount = item.total_price ?? (item.unit_price != null ? item.unit_price * item.quantity : 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const cents = Math.round(amount * 100)
    const currency = item.currency.toLowerCase()
    totals.set(currency, (totals.get(currency) ?? 0) + cents)
  }
  const [currency, amount] = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0] ?? []
  return currency && amount != null ? { currency, amount } : null
}

function totalsMatch(expected: BrowserCheckoutMoney | null | undefined, actual: BrowserCheckoutMoney | null | undefined): boolean {
  if (!expected || !actual) return false
  return expected.currency.toLowerCase() === actual.currency.toLowerCase()
    && Math.abs(expected.amount - actual.amount) <= 1
}

function normalizeDomain(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return value.trim().replace(/^www\./, '').toLowerCase() || null
  }
}
