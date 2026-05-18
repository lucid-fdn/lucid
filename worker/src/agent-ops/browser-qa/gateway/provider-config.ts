import type { Config } from '../../../config.js'

export type BrowserGatewayProviderKind = 'playwright' | 'browserless' | 'browserbase' | 'steel' | 'remote-cdp'
export type BrowserGatewayActionLayer = 'none' | 'stagehand' | 'browser-use'

export type BrowserGatewayProviderConfig = {
  providerKind: BrowserGatewayProviderKind
  actionLayer: BrowserGatewayActionLayer
  cdpWsUrl?: string
  cdpToken?: string
  actionLayerControlUrl?: string
  actionLayerApiKey?: string
  externalProvidersEnabled: boolean
  byoProvidersEnabled: boolean
  premiumFallbackEnabled: boolean
  selectedReason: string
  disabledCandidates: BrowserGatewayProviderKind[]
}

export function resolveBrowserGatewayProviderConfig(config: Config): BrowserGatewayProviderConfig {
  const decision = resolveProviderKind(config)
  return {
    providerKind: decision.providerKind,
    actionLayer: config.BROWSER_QA_ACTION_LAYER ?? 'none',
    cdpWsUrl: resolveCdpWsUrl(decision.providerKind, config),
    cdpToken: resolveCdpToken(decision.providerKind, config),
    actionLayerControlUrl: resolveActionLayerControlUrl(config),
    actionLayerApiKey: resolveActionLayerApiKey(config),
    externalProvidersEnabled: config.BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED,
    byoProvidersEnabled: config.BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED,
    premiumFallbackEnabled: config.BROWSER_OPERATOR_PREMIUM_FALLBACK_ENABLED,
    selectedReason: decision.selectedReason,
    disabledCandidates: decision.disabledCandidates,
  }
}

function resolveProviderKind(config: Config): {
  providerKind: BrowserGatewayProviderKind
  selectedReason: string
  disabledCandidates: BrowserGatewayProviderKind[]
} {
  const explicit = config.BROWSER_QA_GATEWAY_PROVIDER
  const defaultProvider = config.BROWSER_OPERATOR_DEFAULT_PROVIDER ?? 'playwright'
  const disabledCandidates = externalConfiguredProviders(config)
    .filter((provider) => !providerAllowed(provider, config))

  if (explicit) {
    if (providerAllowed(explicit, config)) {
      return { providerKind: explicit, selectedReason: 'explicit_gateway_provider', disabledCandidates }
    }
    return {
      providerKind: 'playwright',
      selectedReason: explicit === 'remote-cdp'
        ? 'explicit_byo_provider_disabled'
        : 'explicit_external_provider_disabled',
      disabledCandidates: Array.from(new Set([...disabledCandidates, explicit])),
    }
  }

  if (defaultProvider !== 'playwright' && providerAllowed(defaultProvider, config)) {
    return { providerKind: defaultProvider, selectedReason: 'default_provider', disabledCandidates }
  }

  for (const candidate of externalConfiguredProviders(config)) {
    if (providerAllowed(candidate, config)) {
      return { providerKind: candidate, selectedReason: 'configured_provider', disabledCandidates }
    }
  }

  if (providerAllowed(defaultProvider, config)) {
    return {
      providerKind: defaultProvider,
      selectedReason: defaultProvider === 'playwright' ? 'lucid_playwright_default' : 'default_provider',
      disabledCandidates,
    }
  }

  return { providerKind: 'playwright', selectedReason: 'lucid_playwright_default', disabledCandidates }
}

function externalConfiguredProviders(config: Config): BrowserGatewayProviderKind[] {
  const providers: BrowserGatewayProviderKind[] = []
  if (config.BROWSERBASE_WS_URL) providers.push('browserbase')
  if (config.STEEL_CDP_WS_URL) providers.push('steel')
  if (config.BROWSERLESS_WS_URL) providers.push('browserless')
  if (config.REMOTE_CDP_WS_URL) providers.push('remote-cdp')
  return providers
}

function providerAllowed(provider: BrowserGatewayProviderKind, config: Config): boolean {
  if (provider === 'playwright') return true
  if (provider === 'remote-cdp') return config.BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED
  return config.BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED
}

function resolveCdpWsUrl(kind: BrowserGatewayProviderKind, config: Config): string | undefined {
  switch (kind) {
    case 'browserless':
      return config.BROWSERLESS_WS_URL
    case 'browserbase':
      return config.BROWSERBASE_WS_URL
    case 'steel':
      return config.STEEL_CDP_WS_URL
    case 'remote-cdp':
      return config.REMOTE_CDP_WS_URL
    case 'playwright':
      return undefined
  }
}

function resolveCdpToken(kind: BrowserGatewayProviderKind, config: Config): string | undefined {
  switch (kind) {
    case 'browserless':
      return config.BROWSERLESS_TOKEN
    case 'browserbase':
      return config.BROWSERBASE_API_KEY
    case 'steel':
      return config.STEEL_API_KEY
    case 'remote-cdp':
      return config.REMOTE_CDP_TOKEN
    case 'playwright':
      return undefined
  }
}

function resolveActionLayerControlUrl(config: Config): string | undefined {
  if (config.BROWSER_QA_ACTION_LAYER === 'browser-use') return config.BROWSER_USE_CONTROL_URL
  if (config.BROWSER_QA_ACTION_LAYER === 'stagehand') return config.STAGEHAND_CONTROL_URL
  return undefined
}

function resolveActionLayerApiKey(config: Config): string | undefined {
  if (config.BROWSER_QA_ACTION_LAYER === 'browser-use') return config.BROWSER_USE_API_KEY
  if (config.BROWSER_QA_ACTION_LAYER === 'stagehand') return config.STAGEHAND_API_KEY
  return undefined
}
