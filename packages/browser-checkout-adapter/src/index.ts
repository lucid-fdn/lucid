export const BROWSER_CHECKOUT_ADAPTER_CONTRACT_VERSION = '2026-05-10' as const
export const BROWSER_CHECKOUT_ADAPTER_SCHEMA_VERSION = 1 as const

export type BrowserCheckoutAdapterLifecycle =
  | 'planned'
  | 'sandbox_ready'
  | 'staging_ready'
  | 'live_ready'
  | 'deprecated'
  | 'blocked'

export type BrowserCheckoutAdapterMode = 'sandbox' | 'merchant_specific'

export type BrowserCheckoutProviderKind =
  | 'lucid_managed'
  | 'playwright'
  | 'browserless'
  | 'browserbase'
  | 'steel'
  | 'remote_cdp'

export type BrowserCheckoutReceiptStrategy =
  | 'synthetic_sandbox'
  | 'merchant_receipt_page'
  | 'email_or_order_history'

export type BrowserCheckoutReliabilityTier =
  | 'live_supported'
  | 'assisted'
  | 'research_only'
  | 'blocked'

export type BrowserCheckoutCapability =
  | 'auto_buy_supported'
  | 'assisted_checkout_supported'
  | 'research_supported'
  | 'cart_supported'
  | 'receipt_supported'
  | 'risk_detection_supported'
  | 'custom_domain_supported'
  | 'official_api_available'

export type BrowserCheckoutKnownFailureReason =
  | 'captcha_risk'
  | 'mfa_risk'
  | 'payment_attention_risk'
  | 'address_attention_risk'
  | 'anti_bot_risk'
  | 'merchant_ui_drift_risk'
  | 'receipt_parse_risk'
  | 'profile_expiry_risk'
  | 'merchant_validation_missing'
  | 'official_api_required'

export type BrowserCheckoutReliability = {
  tier: BrowserCheckoutReliabilityTier
  capabilities: BrowserCheckoutCapability[]
  knownFailureReasons: BrowserCheckoutKnownFailureReason[]
  requiresTakeover: boolean
  apiAvailable: boolean
  preferredProviders: BrowserCheckoutProviderKind[]
  lastVerifiedAt?: string
  telemetry?: {
    successRate?: number
    takeoverRate?: number
    captchaRate?: number
    receiptParseSuccessRate?: number
    checkoutDriftRate?: number
    averageDurationMs?: number
    sampleSize?: number
  }
}

export type BrowserCheckoutApprovalState =
  | 'not_required'
  | 'required'
  | 'approved'
  | 'blocked'
  | 'expired'

export type BrowserCheckoutMoney = {
  amount: number
  currency: string
}

export type BrowserCheckoutMerchant = {
  name: string
  domain?: string
  url?: string
  metadata?: Record<string, unknown>
}

export type BrowserCheckoutCartItem = {
  merchantItemId?: string
  name: string
  quantity: number
  unit?: string
  unitPrice?: number
  totalPrice?: number
  currency: string
  category?: string
  substitutionFor?: string
  policyFlags?: string[]
  metadata?: Record<string, unknown>
}

export type BrowserCheckoutAdapterManifest = {
  contractVersion: typeof BROWSER_CHECKOUT_ADAPTER_CONTRACT_VERSION
  schemaVersion: typeof BROWSER_CHECKOUT_ADAPTER_SCHEMA_VERSION
  id: string
  label: string
  lifecycle: BrowserCheckoutAdapterLifecycle
  mode: BrowserCheckoutAdapterMode
  merchantKeys: string[]
  merchantDomains: string[]
  supportedProviders: BrowserCheckoutProviderKind[]
  countries: string[]
  requiredEnv: string[]
  requiredAccountCapabilities: string[]
  receiptStrategy: BrowserCheckoutReceiptStrategy
  reliability: BrowserCheckoutReliability
  fixtureVersion: string
  timeoutBudgetMs: number
  retryPolicy: {
    readOnlyRetries: number
    finalPurchaseRetries: 0
  }
  failClosedReason?: string
  notes: string[]
}

export type BrowserCheckoutAccountContext = {
  id: string
  merchantKey: string
  merchantName: string
  provider: BrowserCheckoutProviderKind
  authState: string
  capabilities: string[]
  providerProfileRef?: string | null
  providerContextRef?: string | null
  providerSessionRef?: string | null
}

export type BrowserCheckoutRunContext = {
  id: string
  orgId: string
  merchant: BrowserCheckoutMerchant
  approvalState: BrowserCheckoutApprovalState
  cartHash?: string | null
  cartTotal?: BrowserCheckoutMoney | null
  idempotencyKey: string
  metadata?: Record<string, unknown>
}

export type BrowserCheckoutRuntimeContext = {
  account: BrowserCheckoutAccountContext
  run: BrowserCheckoutRunContext
  cartItems: BrowserCheckoutCartItem[]
  approvalToken?: string | null
  browserSessionRef?: string | null
  now?: string
}

export type BrowserCheckoutReceipt = {
  merchantOrderId?: string
  receiptUrl?: string
  receiptArtifactUri?: string
  total?: BrowserCheckoutMoney
  purchasedAt?: string
  rawReceipt: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface BrowserCheckoutAdapter {
  readonly manifest: BrowserCheckoutAdapterManifest
  canHandle(input: BrowserCheckoutRuntimeContext): boolean
  execute(input: BrowserCheckoutRuntimeContext): Promise<BrowserCheckoutReceipt>
}

export type BrowserCheckoutFixture = {
  manifestId: string
  account: BrowserCheckoutAccountContext
  run: BrowserCheckoutRunContext
  cartItems: BrowserCheckoutCartItem[]
  html?: {
    checkoutPage?: string
    confirmationPage?: string
    receiptPage?: string
    orderHistoryPage?: string
  }
  expectedReceipt?: Partial<BrowserCheckoutReceipt>
  expectedFailures?: string[]
}

export type BrowserCheckoutConformanceCheck =
  | 'manifest_valid'
  | 'domain_match'
  | 'lifecycle_executable'
  | 'profile_required'
  | 'approval_required'
  | 'idempotency_present'
  | 'receipt_strategy_declared'
  | 'final_purchase_no_retry'
  | 'sandbox_receipt'

export type BrowserCheckoutConformanceResult = {
  ok: boolean
  adapterId: string
  checks: Array<{
    id: BrowserCheckoutConformanceCheck
    ok: boolean
    message: string
  }>
}

const EXECUTABLE_LIFECYCLES = new Set<BrowserCheckoutAdapterLifecycle>([
  'sandbox_ready',
  'staging_ready',
  'live_ready',
])

const MANIFEST_ID_PATTERN = /^[a-z][a-z0-9_-]{1,80}$/
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

export function createBrowserCheckoutAdapterManifest(
  input: Omit<BrowserCheckoutAdapterManifest, 'contractVersion' | 'schemaVersion'> &
    Partial<Pick<BrowserCheckoutAdapterManifest, 'contractVersion' | 'schemaVersion'>>,
): BrowserCheckoutAdapterManifest {
  const manifest: BrowserCheckoutAdapterManifest = {
    ...input,
    contractVersion: input.contractVersion ?? BROWSER_CHECKOUT_ADAPTER_CONTRACT_VERSION,
    schemaVersion: input.schemaVersion ?? BROWSER_CHECKOUT_ADAPTER_SCHEMA_VERSION,
  }
  const validation = validateBrowserCheckoutAdapterManifest(manifest)
  if (!validation.ok) {
    throw new Error(validation.errors.join('; '))
  }
  return manifest
}

export function validateBrowserCheckoutAdapterManifest(
  manifest: BrowserCheckoutAdapterManifest,
): { ok: true; errors: [] } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (manifest.contractVersion !== BROWSER_CHECKOUT_ADAPTER_CONTRACT_VERSION) {
    errors.push(`Unsupported contractVersion ${manifest.contractVersion}`)
  }
  if (manifest.schemaVersion !== BROWSER_CHECKOUT_ADAPTER_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion ${manifest.schemaVersion}`)
  }
  if (!MANIFEST_ID_PATTERN.test(manifest.id)) {
    errors.push('id must be lowercase kebab/snake case and start with a letter')
  }
  if (!manifest.label.trim()) errors.push('label is required')
  if (manifest.merchantKeys.length === 0) errors.push('merchantKeys must include at least one key')
  if (manifest.merchantDomains.length === 0) errors.push('merchantDomains must include at least one domain')
  for (const domain of manifest.merchantDomains) {
    if (!DOMAIN_PATTERN.test(domain)) errors.push(`Invalid merchant domain: ${domain}`)
  }
  if (manifest.supportedProviders.length === 0) errors.push('supportedProviders must include at least one provider')
  if (manifest.reliability.preferredProviders.length === 0) {
    errors.push('reliability.preferredProviders must include at least one provider')
  }
  if (manifest.reliability.tier === 'live_supported' && manifest.lifecycle !== 'live_ready' && manifest.lifecycle !== 'sandbox_ready') {
    errors.push('live_supported adapters must be live_ready or sandbox_ready')
  }
  if (manifest.reliability.tier === 'live_supported' && !manifest.reliability.capabilities.includes('auto_buy_supported')) {
    errors.push('live_supported adapters must declare auto_buy_supported')
  }
  if (manifest.reliability.tier !== 'live_supported' && manifest.reliability.capabilities.includes('auto_buy_supported')) {
    errors.push('auto_buy_supported is only allowed for live_supported adapters')
  }
  if (manifest.reliability.tier === 'blocked' && !manifest.failClosedReason) {
    errors.push('blocked adapters must include failClosedReason')
  }
  if (manifest.timeoutBudgetMs < 1_000 || manifest.timeoutBudgetMs > 20 * 60_000) {
    errors.push('timeoutBudgetMs must be between 1s and 20m')
  }
  if (manifest.retryPolicy.finalPurchaseRetries !== 0) {
    errors.push('finalPurchaseRetries must be 0')
  }
  if (manifest.fixtureVersion.trim().length === 0) errors.push('fixtureVersion is required')
  if (manifest.lifecycle !== 'live_ready' && !manifest.failClosedReason && manifest.mode === 'merchant_specific') {
    errors.push('non-live merchant-specific adapters must include failClosedReason')
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}

export function isBrowserCheckoutAdapterExecutable(
  manifest: BrowserCheckoutAdapterManifest,
): boolean {
  return EXECUTABLE_LIFECYCLES.has(manifest.lifecycle)
}

export function isBrowserCheckoutAutonomousSupported(
  manifest: BrowserCheckoutAdapterManifest,
): boolean {
  return isBrowserCheckoutAdapterExecutable(manifest)
    && manifest.reliability.tier === 'live_supported'
    && manifest.reliability.capabilities.includes('auto_buy_supported')
}

export function browserCheckoutReliabilityLabel(tier: BrowserCheckoutReliabilityTier): string {
  switch (tier) {
    case 'live_supported':
      return 'Auto-buy supported'
    case 'assisted':
      return 'Assisted checkout'
    case 'research_only':
      return 'Research only'
    case 'blocked':
      return 'Blocked'
  }
}

export function assertBrowserCheckoutAdapterExecutable(
  manifest: BrowserCheckoutAdapterManifest,
): void {
  if (isBrowserCheckoutAdapterExecutable(manifest)) return
  throw new Error(
    `${manifest.label} checkout is ${manifest.lifecycle}; execution is fail-closed until conformance and live readiness are complete.`,
  )
}

export function normalizeMerchantDomain(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    const normalized = value.trim().replace(/^www\./, '').toLowerCase()
    return normalized || null
  }
}

export function merchantMatchesManifest(input: {
  manifest: BrowserCheckoutAdapterManifest
  merchantKey?: string | null
  merchant?: BrowserCheckoutMerchant | null
}): boolean {
  const key = input.merchantKey?.trim().toLowerCase()
  if (key && input.manifest.merchantKeys.includes(key)) return true
  const domain = normalizeMerchantDomain(input.merchant?.domain ?? input.merchant?.url)
  if (!domain) return false
  return input.manifest.merchantDomains.some((candidate) =>
    domain === candidate || domain.endsWith(`.${candidate}`))
}

export function summarizeBrowserCheckoutCart(
  cartItems: BrowserCheckoutCartItem[],
): BrowserCheckoutMoney | null {
  const totals = new Map<string, number>()
  for (const item of cartItems) {
    const amount = item.totalPrice ?? (item.unitPrice != null ? item.unitPrice * item.quantity : 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const cents = Math.round(amount * 100)
    const currency = item.currency.toLowerCase()
    totals.set(currency, (totals.get(currency) ?? 0) + cents)
  }
  const [currency, amount] = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0] ?? []
  return currency && amount != null ? { currency, amount } : null
}

export function createBrowserCheckoutFixture(
  input: BrowserCheckoutFixture,
): BrowserCheckoutFixture {
  if (input.manifestId.trim().length === 0) throw new Error('manifestId is required')
  if (input.cartItems.length === 0) throw new Error('fixture cartItems must not be empty')
  if (!input.run.idempotencyKey || input.run.idempotencyKey.length < 8) {
    throw new Error('fixture run requires a stable idempotencyKey')
  }
  return input
}

export async function runBrowserCheckoutAdapterConformance(input: {
  adapter: BrowserCheckoutAdapter
  fixture: BrowserCheckoutFixture
}): Promise<BrowserCheckoutConformanceResult> {
  const { adapter, fixture } = input
  const checks: BrowserCheckoutConformanceResult['checks'] = []
  const push = (id: BrowserCheckoutConformanceCheck, ok: boolean, message: string) => {
    checks.push({ id, ok, message })
  }

  const manifestValidation = validateBrowserCheckoutAdapterManifest(adapter.manifest)
  push('manifest_valid', manifestValidation.ok, manifestValidation.ok ? 'manifest is valid' : manifestValidation.errors.join('; '))

  const runtimeContext: BrowserCheckoutRuntimeContext = {
    account: fixture.account,
    run: fixture.run,
    cartItems: fixture.cartItems,
  }
  push('domain_match', adapter.canHandle(runtimeContext), 'adapter should match its fixture merchant')
  push('lifecycle_executable', isBrowserCheckoutAdapterExecutable(adapter.manifest), `lifecycle is ${adapter.manifest.lifecycle}`)
  push('profile_required', adapter.manifest.requiredAccountCapabilities.includes('active_provider_profile'), 'active provider profile is declared')
  push('approval_required', adapter.manifest.requiredAccountCapabilities.includes('approval_boundary_verified'), 'approval boundary is declared')
  push('idempotency_present', fixture.run.idempotencyKey.length >= 8, 'fixture has stable idempotency key')
  push('receipt_strategy_declared', Boolean(adapter.manifest.receiptStrategy), `receipt strategy is ${adapter.manifest.receiptStrategy}`)
  push('final_purchase_no_retry', adapter.manifest.retryPolicy.finalPurchaseRetries === 0, 'final purchase retry count is zero')

  if (adapter.manifest.lifecycle === 'sandbox_ready') {
    try {
      const receipt = await adapter.execute(runtimeContext)
      push('sandbox_receipt', Boolean(receipt.rawReceipt && (receipt.receiptUrl || receipt.receiptArtifactUri)), 'sandbox execution returns receipt proof')
    } catch (error) {
      push('sandbox_receipt', false, error instanceof Error ? error.message : String(error))
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    adapterId: adapter.manifest.id,
    checks,
  }
}
