import { z } from 'zod'
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

export const SHOPIFY_ADAPTER_ID = 'shopify'
export const SHOPIFY_PLATFORM_DOMAIN = 'myshopify.com'

const ShopifyCartItemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  key: z.string().optional(),
  product_id: z.union([z.string(), z.number()]).optional(),
  variant_id: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional(),
  product_title: z.string().optional(),
  variant_title: z.string().nullable().optional(),
  quantity: z.number().finite().nonnegative().default(0),
  price: z.number().finite().optional(),
  final_line_price: z.number().finite().optional(),
  line_price: z.number().finite().optional(),
  url: z.string().optional(),
  vendor: z.string().optional(),
  product_type: z.string().optional(),
})

const ShopifyCartSchema = z.object({
  token: z.string().optional(),
  currency: z.string().min(1).default('USD'),
  item_count: z.number().finite().nonnegative().default(0),
  total_price: z.number().finite().nonnegative().default(0),
  original_total_price: z.number().finite().nonnegative().optional(),
  total_discount: z.number().finite().nonnegative().optional(),
  items: z.array(ShopifyCartItemSchema).default([]),
})

export type ShopifyCartEvidence = z.infer<typeof ShopifyCartSchema>

export type ShopifyParsedCart = {
  provider: 'shopify_ajax_cart'
  cartTokenPresent: boolean
  itemCount: number
  total: BrowserCheckoutMoney
  originalTotal?: BrowserCheckoutMoney
  discount?: BrowserCheckoutMoney
  items: Array<{
    id?: string
    productId?: string
    variantId?: string
    title: string
    quantity: number
    unitPrice?: BrowserCheckoutMoney
    lineTotal?: BrowserCheckoutMoney
    url?: string
    vendor?: string
    productType?: string
  }>
}

export type ShopifyReceiptEvidence = {
  provider: 'shopify_order_status'
  orderName?: string
  orderId?: string
  confirmationNumber?: string
  receiptUrl?: string
  total?: BrowserCheckoutMoney
  rawSignals: string[]
}

export function shopifyStorefrontDomains(account: Pick<BrowserOperatorAccount, 'metadata'>): string[] {
  const metadata = account.metadata ?? {}
  const candidates = [
    metadata.shopify_domain,
    metadata.shopify_store_domain,
    metadata.storefront_domain,
    metadata.primary_domain,
    metadata.custom_domain,
    metadata.shopify_domains,
    metadata.storefront_domains,
    metadata.custom_domains,
  ]
  return candidates
    .flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => normalizeMerchantDomain(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
}

export function shopifyMerchantMatches(input: {
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
  return shopifyStorefrontDomains(input.account).some((candidate) =>
    domain === candidate || domain.endsWith(`.${candidate}`))
}

export function parseShopifyCartEvidence(value: unknown): ShopifyParsedCart {
  const cart = ShopifyCartSchema.parse(value)
  const currency = cart.currency.toLowerCase()
  return {
    provider: 'shopify_ajax_cart',
    cartTokenPresent: Boolean(cart.token),
    itemCount: cart.item_count,
    total: money(cart.total_price, currency),
    originalTotal: cart.original_total_price == null ? undefined : money(cart.original_total_price, currency),
    discount: cart.total_discount == null ? undefined : money(cart.total_discount, currency),
    items: cart.items.map((item) => ({
      id: stringifyId(item.id ?? item.key),
      productId: stringifyId(item.product_id),
      variantId: stringifyId(item.variant_id),
      title: item.product_title ?? item.title ?? 'Shopify item',
      quantity: item.quantity,
      unitPrice: item.price == null ? undefined : money(item.price, currency),
      lineTotal: item.final_line_price == null && item.line_price == null
        ? undefined
        : money(item.final_line_price ?? item.line_price ?? 0, currency),
      url: item.url,
      vendor: item.vendor,
      productType: item.product_type,
    })),
  }
}

export function parseShopifyReceiptEvidence(input: {
  html?: string | null
  text?: string | null
  url?: string | null
  currency?: string | null
}): ShopifyReceiptEvidence {
  const source = compactText([input.text, stripHtml(input.html)].filter(Boolean).join(' '))
  const rawSignals: string[] = []
  const orderName = matchFirst(source, [
    /order\s+(#\d{3,})/i,
    /order\s+number\s*:?\s*(#?\d{3,})/i,
    /confirmation\s*:?\s*(#?\d{3,})/i,
  ])
  if (orderName) rawSignals.push('order_name')

  const orderId = matchFirst(source, [
    /order\s+id\s*:?\s*([a-z0-9:/_-]{8,})/i,
    /gid:\/\/shopify\/Order\/(\d+)/i,
  ])
  if (orderId) rawSignals.push('order_id')

  const confirmationNumber = matchFirst(source, [
    /confirmation\s+number\s*:?\s*([a-z0-9-]{4,})/i,
  ])
  if (confirmationNumber) rawSignals.push('confirmation_number')

  const total = parseReceiptTotal(source, input.currency)
  if (total) rawSignals.push('total')

  return {
    provider: 'shopify_order_status',
    orderName,
    orderId,
    confirmationNumber,
    receiptUrl: input.url ?? undefined,
    total,
    rawSignals,
  }
}

function money(minorUnits: number, currency: string): BrowserCheckoutMoney {
  return {
    amount: Math.round(minorUnits),
    currency,
  }
}

function stringifyId(value: string | number | undefined): string | undefined {
  if (value == null) return undefined
  return String(value)
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

function parseReceiptTotal(source: string, fallbackCurrency: string | null | undefined): BrowserCheckoutMoney | undefined {
  const match = source.match(/(?:total|paid)\s*:?\s*(?:([A-Z]{3})\s*)?[$€£]?\s*([0-9]+(?:[.,][0-9]{2})?)/i)
  if (!match) return undefined
  const currency = (match[1] ?? fallbackCurrency ?? inferCurrencyFromSymbol(match[0]) ?? 'USD').toLowerCase()
  const major = Number.parseFloat(match[2].replace(',', '.'))
  if (!Number.isFinite(major)) return undefined
  return money(major * 100, currency)
}

function inferCurrencyFromSymbol(value: string): string | undefined {
  if (value.includes('€')) return 'EUR'
  if (value.includes('£')) return 'GBP'
  if (value.includes('$')) return 'USD'
  return undefined
}
