import type { BrowserGatewayProviderKind } from './provider-config.js'

export type BrowserGatewayTaskClass =
  | 'read_only_public'
  | 'interactive_public'
  | 'authenticated_account'
  | 'commerce_checkout'

export type BrowserGatewayProviderHealth = {
  provider: BrowserGatewayProviderKind
  healthy: boolean
  medianLatencyMs?: number
  costPerBrowserMinuteUsd?: number
  quotaRemaining?: number
  recentFailureCount?: number
  supportsProxy?: boolean
  supportsCaptcha?: boolean
}

export type BrowserGatewayProviderRouterInput = {
  taskClass: BrowserGatewayTaskClass
  defaultProvider: BrowserGatewayProviderKind
  accountProvider?: BrowserGatewayProviderKind | null
  externalProvidersEnabled: boolean
  byoProvidersEnabled: boolean
  premiumFallbackEnabled: boolean
  requiresProxy?: boolean
  requiresCaptchaSupport?: boolean
  providerHealth: BrowserGatewayProviderHealth[]
}

export type BrowserGatewayProviderRouterDecision = {
  provider: BrowserGatewayProviderKind
  fallbackEligible: boolean
  pinned: boolean
  reason: string
  candidates: BrowserGatewayProviderHealth[]
}

const PREMIUM_PROVIDERS = new Set<BrowserGatewayProviderKind>(['browserbase', 'steel', 'browserless'])

export function routeBrowserGatewayProvider(
  input: BrowserGatewayProviderRouterInput,
): BrowserGatewayProviderRouterDecision {
  const healthy = input.providerHealth.filter((provider) => provider.healthy && provider.quotaRemaining !== 0)

  if (input.taskClass === 'authenticated_account' || input.taskClass === 'commerce_checkout') {
    const provider = input.accountProvider ?? input.defaultProvider
    return {
      provider,
      fallbackEligible: false,
      pinned: true,
      reason: healthy.some((candidate) => candidate.provider === provider)
        ? 'account_provider_affinity'
        : 'account_provider_unhealthy_reconnect_required',
      candidates: healthy,
    }
  }

  const byo = healthy.find((candidate) => candidate.provider === 'remote-cdp')
  if (byo && input.byoProvidersEnabled) {
    return {
      provider: byo.provider,
      fallbackEligible: input.taskClass === 'read_only_public',
      pinned: false,
      reason: 'byo_provider_available',
      candidates: healthy,
    }
  }

  if (input.externalProvidersEnabled && input.premiumFallbackEnabled) {
    const premium = chooseLowestScore(healthy.filter((candidate) => {
      if (!PREMIUM_PROVIDERS.has(candidate.provider)) return false
      if (input.requiresProxy && !candidate.supportsProxy) return false
      if (input.requiresCaptchaSupport && !candidate.supportsCaptcha) return false
      return true
    }))
    if (premium && (input.requiresProxy || input.requiresCaptchaSupport)) {
      return {
        provider: premium.provider,
        fallbackEligible: input.taskClass === 'read_only_public',
        pinned: false,
        reason: input.requiresProxy ? 'premium_proxy_required' : 'premium_captcha_required',
        candidates: healthy,
      }
    }
  }

  const defaultHealth = healthy.find((candidate) => candidate.provider === input.defaultProvider)
  return {
    provider: defaultHealth?.provider ?? 'playwright',
    fallbackEligible: input.taskClass === 'read_only_public'
      && Boolean(input.premiumFallbackEnabled && (input.externalProvidersEnabled || input.byoProvidersEnabled)),
    pinned: false,
    reason: defaultHealth ? 'lucid_default_provider' : 'default_provider_degraded',
    candidates: healthy,
  }
}

function chooseLowestScore(
  providers: BrowserGatewayProviderHealth[],
): BrowserGatewayProviderHealth | null {
  let best: BrowserGatewayProviderHealth | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const provider of providers) {
    const score = providerScore(provider)
    if (score < bestScore) {
      best = provider
      bestScore = score
    }
  }
  return best
}

function providerScore(provider: BrowserGatewayProviderHealth): number {
  return (provider.medianLatencyMs ?? 1000)
    + (provider.costPerBrowserMinuteUsd ?? 0.01) * 100_000
    + (provider.recentFailureCount ?? 0) * 10_000
}
