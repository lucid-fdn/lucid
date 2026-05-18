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

export const CARREFOUR_ADAPTER_ID = 'carrefour'

export const CARREFOUR_DOMAINS = [
  'carrefour.fr',
  'courses.carrefour.fr',
  'carrefour.es',
  'carrefour.it',
  'carrefour.be',
] as const

export type CarrefourCartEvidence = {
  provider: 'carrefour_cart_page'
  itemCount?: number
  subtotal?: BrowserCheckoutMoney
  estimatedTotal?: BrowserCheckoutMoney
  deliverySlot?: string
  rawSignals: string[]
}

export type CarrefourReceiptEvidence = {
  provider: 'carrefour_order_confirmation'
  orderId?: string
  receiptUrl?: string
  total?: BrowserCheckoutMoney
  pickupOrDeliveryWindow?: string
  rawSignals: string[]
}

export type CarrefourRiskEvidence = {
  requiresHumanTakeover: boolean
  reasons: string[]
}

export function carrefourMerchantDomains(account: Pick<BrowserOperatorAccount, 'metadata'>): string[] {
  const metadata = account.metadata ?? {}
  const candidates = [
    metadata.carrefour_domain,
    metadata.carrefour_store_domain,
    metadata.carrefour_marketplace_domain,
    metadata.carrefour_domains,
  ]
  const customDomains = candidates
    .flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => normalizeMerchantDomain(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))

  return Array.from(new Set([...CARREFOUR_DOMAINS, ...customDomains]))
}

export function carrefourMerchantMatches(input: {
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
  return carrefourMerchantDomains(input.account).some((candidate) =>
    domain === candidate || domain.endsWith(`.${candidate}`))
}

export function parseCarrefourCartEvidence(input: {
  html?: string | null
  text?: string | null
  url?: string | null
  currency?: string | null
}): CarrefourCartEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' '))
  const rawSignals: string[] = []
  const itemCount = parseItemCount(source)
  if (itemCount != null) rawSignals.push('item_count')

  const subtotal = parseMoneyNearLabel(source, [
    'Sous-total',
    'Subtotal',
    'Total produits',
  ], input.currency)
  if (subtotal) rawSignals.push('subtotal')

  const estimatedTotal = parseMoneyNearLabel(source, [
    'Total estimé',
    'Total panier',
    'Total à payer',
    'Total',
  ], input.currency)
  if (estimatedTotal) rawSignals.push('estimated_total')

  const deliverySlot = matchFirst(source, [
    /(?:créneau|livraison|retrait)\s*:?\s*([A-Za-zÀ-ÿ0-9,.\-\s]{6,80})/i,
  ])
  if (deliverySlot) rawSignals.push('delivery_slot')

  return {
    provider: 'carrefour_cart_page',
    itemCount,
    subtotal,
    estimatedTotal,
    deliverySlot,
    rawSignals,
  }
}

export function parseCarrefourReceiptEvidence(input: {
  html?: string | null
  text?: string | null
  url?: string | null
  currency?: string | null
}): CarrefourReceiptEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' '))
  const rawSignals: string[] = []
  const orderId = matchFirst(source, [
    /(?:commande|order)\s*(?:n[°o]|#|number)?\s*:?\s*([A-Z0-9-]{6,})/i,
    /\b(CRF-[A-Z0-9-]{6,})\b/i,
  ])
  if (orderId) rawSignals.push('order_id')

  const total = parseMoneyNearLabel(source, [
    'Total payé',
    'Montant payé',
    'Total de la commande',
    'Total',
  ], input.currency)
  if (total) rawSignals.push('total')

  const pickupOrDeliveryWindow = matchFirst(source, [
    /(?:créneau|livraison|retrait)\s*:?\s*([A-Za-zÀ-ÿ0-9,.\-\s]{6,80})/i,
  ])
  if (pickupOrDeliveryWindow) rawSignals.push('pickup_or_delivery_window')

  return {
    provider: 'carrefour_order_confirmation',
    orderId,
    receiptUrl: input.url ?? undefined,
    total,
    pickupOrDeliveryWindow,
    rawSignals,
  }
}

export function detectCarrefourCheckoutRisk(input: {
  html?: string | null
  text?: string | null
}): CarrefourRiskEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' ')).toLowerCase()
  const reasons: string[] = []
  if (/(3d secure|3ds|authentification bancaire|validation bancaire|code de sécurité)/i.test(source)) {
    reasons.push('payment_auth_required')
  }
  if (/(captcha|robot|vérifiez que vous êtes humain)/i.test(source)) {
    reasons.push('captcha_or_bot_check')
  }
  if (/(créneau.*indisponible|aucun créneau|slot unavailable|rupture|indisponible)/i.test(source)) {
    reasons.push('availability_attention_required')
  }
  if (/(adresse.*requise|adresse de livraison|choisir une adresse)/i.test(source)) {
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
  const match = source.match(/\b(\d+)\s*(?:articles?|produits?|items?)\b/i)
    ?? source.match(/(?:panier|cart)\s*\(?\s*(\d+)\s*(?:articles?|items?)\s*\)?/i)
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
    const pattern = new RegExp(`${escaped}\\s*:?\\s*(?:([A-Z]{3})\\s*)?([$€£])?\\s*([0-9][0-9\\s.,]*)`, 'i')
    const match = source.match(pattern)
    if (!match) continue
    const currency = (match[1] ?? fallbackCurrency ?? inferCurrencyFromSymbol(match[2]) ?? 'EUR').toLowerCase()
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
