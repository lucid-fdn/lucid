import type { BrowserOperatorProviderKind } from '@contracts/browser-operator'

export type BrowserOperatorTaskClass =
  | 'read_only_public'
  | 'interactive_public'
  | 'authenticated_account'
  | 'commerce_checkout'

export type BrowserOperatorProviderRoutingInput = {
  taskClass: BrowserOperatorTaskClass
  defaultProvider?: BrowserOperatorProviderKind
  accountProvider?: BrowserOperatorProviderKind | null
  requiresProxy?: boolean
  requiresCaptchaSupport?: boolean
  externalProvidersEnabled?: boolean
  byoProvidersEnabled?: boolean
  premiumFallbackEnabled?: boolean
  byoProviderAvailable?: boolean
  healthyProviders?: BrowserOperatorProviderKind[]
}

export type BrowserOperatorProviderRoutingDecision = {
  provider: BrowserOperatorProviderKind
  fallbackEligible: boolean
  pinned: boolean
  reason: string
  blockedProviders: BrowserOperatorProviderKind[]
}

const EXTERNAL_PROVIDERS = new Set<BrowserOperatorProviderKind>([
  'browserbase',
  'steel',
  'browserless',
])

export function decideBrowserOperatorProvider(
  input: BrowserOperatorProviderRoutingInput,
): BrowserOperatorProviderRoutingDecision {
  const defaultProvider = input.defaultProvider ?? 'playwright'
  const healthy: BrowserOperatorProviderKind[] = input.healthyProviders?.length
    ? input.healthyProviders
    : ['playwright']
  const blockedProviders: BrowserOperatorProviderKind[] = healthy.filter(
    (provider) => !providerAllowed(provider, input),
  )

  if (input.taskClass === 'authenticated_account' || input.taskClass === 'commerce_checkout') {
    const provider = input.accountProvider ?? defaultProvider
    return {
      provider,
      fallbackEligible: false,
      pinned: true,
      reason: providerAllowed(provider, input)
        ? 'account_provider_affinity'
        : 'account_provider_disabled_reconnect_required',
      blockedProviders,
    }
  }

  if (input.byoProviderAvailable && input.byoProvidersEnabled && healthy.includes('remote_cdp')) {
    return {
      provider: 'remote_cdp',
      fallbackEligible: input.taskClass === 'read_only_public',
      pinned: false,
      reason: 'byo_provider_available',
      blockedProviders,
    }
  }

  if (
    input.externalProvidersEnabled &&
    input.premiumFallbackEnabled &&
    (input.requiresProxy || input.requiresCaptchaSupport)
  ) {
    const premium = healthy.find((provider) => provider === 'steel' || provider === 'browserbase')
    if (premium && providerAllowed(premium, input)) {
      return {
        provider: premium,
        fallbackEligible: input.taskClass === 'read_only_public',
        pinned: false,
        reason: input.requiresProxy ? 'premium_proxy_required' : 'premium_captcha_required',
        blockedProviders,
      }
    }
  }

  return {
    provider: providerAllowed(defaultProvider, input) ? defaultProvider : 'playwright',
    fallbackEligible: input.taskClass === 'read_only_public' && Boolean(
      input.premiumFallbackEnabled && (input.externalProvidersEnabled || input.byoProvidersEnabled),
    ),
    pinned: false,
    reason: 'lucid_default_provider',
    blockedProviders,
  }
}

function providerAllowed(
  provider: BrowserOperatorProviderKind,
  input: BrowserOperatorProviderRoutingInput,
): boolean {
  if (provider === 'playwright' || provider === 'lucid_managed') return true
  if (provider === 'remote_cdp') return Boolean(input.byoProvidersEnabled)
  if (EXTERNAL_PROVIDERS.has(provider)) return Boolean(input.externalProvidersEnabled)
  return false
}
