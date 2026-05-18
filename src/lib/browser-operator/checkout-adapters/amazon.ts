import {
  merchantMatchesManifest,
  normalizeMerchantDomain,
  type BrowserCheckoutAdapterManifest,
  type BrowserCheckoutMoney,
} from '@lucid/browser-checkout-adapter'
import type {
  BrowserOperatorAccount,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'

export const AMAZON_ADAPTER_ID = 'amazon'

export const AMAZON_DOMAINS = [
  'amazon.com',
  'amazon.ca',
  'amazon.co.uk',
  'amazon.de',
  'amazon.fr',
  'amazon.es',
  'amazon.it',
  'amazon.nl',
  'amazon.se',
  'amazon.pl',
  'amazon.com.be',
  'amazon.com.au',
  'amazon.co.jp',
  'amazon.in',
] as const

export type AmazonCartEvidence = {
  provider: 'amazon_cart_page'
  itemCount?: number
  subtotal?: BrowserCheckoutMoney
  estimatedTotal?: BrowserCheckoutMoney
  rawSignals: string[]
}

export type AmazonReceiptEvidence = {
  provider: 'amazon_order_confirmation'
  orderId?: string
  receiptUrl?: string
  total?: BrowserCheckoutMoney
  deliveryEstimate?: string
  rawSignals: string[]
}

export type AmazonRiskEvidence = {
  requiresHumanTakeover: boolean
  reasons: string[]
}

export function amazonMerchantDomains(account: Pick<BrowserOperatorAccount, 'metadata'>): string[] {
  const metadata = account.metadata ?? {}
  const candidates = [
    metadata.amazon_domain,
    metadata.amazon_store_domain,
    metadata.amazon_marketplace_domain,
    metadata.amazon_domains,
    metadata.amazon_marketplace_domains,
  ]
  const customDomains = candidates
    .flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => normalizeMerchantDomain(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))

  return Array.from(new Set([...AMAZON_DOMAINS, ...customDomains]))
}

export function amazonMerchantMatches(input: {
  manifest: BrowserCheckoutAdapterManifest
  account: Pick<BrowserOperatorAccount, 'merchant_key' | 'metadata'>
  purchaseRun: Pick<BrowserOperatorPurchaseRun, 'merchant'>
}): boolean {
  if (merchantMatchesManifest({
    manifest: input.manifest,
    merchantKey: input.account.merchant_key,
    merchant: input.purchaseRun.merchant,
  })) {
    return true
  }

  const domain = normalizeMerchantDomain(input.purchaseRun.merchant.domain ?? input.purchaseRun.merchant.url)
  if (!domain) return false
  return amazonMerchantDomains(input.account).some((candidate) =>
    domain === candidate || domain.endsWith(`.${candidate}`))
}

export function parseAmazonCartEvidence(input: {
  html?: string | null
  text?: string | null
  url?: string | null
  currency?: string | null
}): AmazonCartEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' '))
  const rawSignals: string[] = []
  const itemCount = parseItemCount(source)
  if (itemCount != null) rawSignals.push('item_count')

  const subtotal = parseMoneyNearLabel(source, [
    'Subtotal',
    'Cart subtotal',
    'Items subtotal',
    'Sous-total',
  ], input.currency)
  if (subtotal) rawSignals.push('subtotal')

  const estimatedTotal = parseMoneyNearLabel(source, [
    'Estimated total',
    'Order total',
    'Total',
    'Total de la commande',
  ], input.currency)
  if (estimatedTotal) rawSignals.push('estimated_total')

  return {
    provider: 'amazon_cart_page',
    itemCount,
    subtotal,
    estimatedTotal,
    rawSignals,
  }
}

export function parseAmazonReceiptEvidence(input: {
  html?: string | null
  text?: string | null
  url?: string | null
  currency?: string | null
}): AmazonReceiptEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' '))
  const rawSignals: string[] = []
  const orderId = matchFirst(source, [
    /order\s*(?:#|number|id)?\s*:?\s*(\d{3}-\d{7}-\d{7})/i,
    /commande\s*(?:n[°o]|#)?\s*:?\s*(\d{3}-\d{7}-\d{7})/i,
    /\b(\d{3}-\d{7}-\d{7})\b/,
  ])
  if (orderId) rawSignals.push('order_id')

  const total = parseMoneyNearLabel(source, [
    'Order total',
    'Grand total',
    'Total',
    'Total de la commande',
    'Montant total',
  ], input.currency)
  if (total) rawSignals.push('total')

  const deliveryEstimate = matchFirst(source, [
    /(?:arriving|delivery|delivered|livraison|arrive)\s*:?\s*([A-Za-zÀ-ÿ0-9,.\-\s]{4,80})/i,
  ])
  if (deliveryEstimate) rawSignals.push('delivery_estimate')

  return {
    provider: 'amazon_order_confirmation',
    orderId,
    receiptUrl: input.url ?? undefined,
    total,
    deliveryEstimate,
    rawSignals,
  }
}

export function detectAmazonCheckoutRisk(input: {
  html?: string | null
  text?: string | null
}): AmazonRiskEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' ')).toLowerCase()
  const reasons: string[] = []
  if (/(two[-\s]?step|2fa|one[-\s]?time password|otp|verification code|code de vérification)/i.test(source)) {
    reasons.push('mfa_required')
  }
  if (/(captcha|enter the characters|type the characters|robot check|automated access)/i.test(source)) {
    reasons.push('captcha_or_bot_check')
  }
  if (/(payment revision needed|update your payment method|paiement.*mettre à jour|payment declined)/i.test(source)) {
    reasons.push('payment_attention_required')
  }
  if (/(address.*required|select a shipping address|adresse.*livraison)/i.test(source)) {
    reasons.push('address_attention_required')
  }
  return {
    requiresHumanTakeover: reasons.length > 0,
    reasons,
  }
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function matchFirst(source: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = source.match(pattern)?.[1]?.trim()
    if (match) return match
  }
  return undefined
}

function parseItemCount(source: string): number | undefined {
  const match = source.match(/(?:subtotal|cart|basket|panier)\s*\(?\s*(\d+)\s*(?:items?|articles?)\s*\)?/i)
    ?? source.match(/\b(\d+)\s*(?:items?|articles?)\b/i)
  if (!match) return undefined
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseMoneyNearLabel(
  source: string,
  labels: string[],
  fallbackCurrency: string | null | undefined,
): BrowserCheckoutMoney | undefined {
  for (const label of labels) {
    const escaped = escapeRegExp(label)
    const pattern = new RegExp(`${escaped}(?:\\s*\\([^)]*\\))?\\s*:?\\s*(?:([A-Z]{3})\\s*)?([$€£])?\\s*([0-9][0-9\\s.,]*)`, 'i')
    const match = source.match(pattern)
    if (!match) continue
    const currency = (match[1] ?? fallbackCurrency ?? inferCurrencyFromSymbol(match[2]) ?? 'USD').toLowerCase()
    const amount = parseMajorAmount(match[3])
    if (amount == null) continue
    return {
      amount: Math.round(amount * 100),
      currency,
    }
  }
  return undefined
}

function parseMajorAmount(value: string): number | undefined {
  const compact = value.replace(/\s/g, '')
  const normalized = compact.includes(',') && !compact.includes('.')
    ? compact.replace(',', '.')
    : compact.replace(/,/g, '')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function inferCurrencyFromSymbol(value: string | undefined): string | undefined {
  if (value === '€') return 'EUR'
  if (value === '£') return 'GBP'
  if (value === '$') return 'USD'
  return undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
