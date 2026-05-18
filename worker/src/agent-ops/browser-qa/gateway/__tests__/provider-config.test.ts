import { describe, expect, it } from 'vitest'

import type { Config } from '../../../../config.js'
import { resolveBrowserGatewayProviderConfig } from '../provider-config.js'

const BASE_CONFIG = {
  BROWSER_QA_ACTION_LAYER: 'none',
  BROWSER_OPERATOR_DEFAULT_PROVIDER: 'playwright',
  BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED: false,
  BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED: false,
  BROWSER_OPERATOR_PREMIUM_FALLBACK_ENABLED: false,
} as unknown as Config

describe('Browser gateway provider config', () => {
  it('keeps Playwright as the isolated default provider', () => {
    expect(resolveBrowserGatewayProviderConfig(BASE_CONFIG)).toMatchObject({
      providerKind: 'playwright',
      actionLayer: 'none',
    })
  })

  it('selects Browserbase as a CDP provider when a websocket endpoint is configured', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED: true,
      BROWSERBASE_WS_URL: 'wss://connect.browserbase.com/project/session',
      BROWSERBASE_API_KEY: 'bb-key',
    } as unknown as Config

    expect(resolveBrowserGatewayProviderConfig(config)).toMatchObject({
      providerKind: 'browserbase',
      cdpWsUrl: 'wss://connect.browserbase.com/project/session',
      cdpToken: 'bb-key',
      externalProvidersEnabled: true,
    })
  })

  it('does not auto-select external providers when external providers are disabled', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSERBASE_WS_URL: 'wss://connect.browserbase.com/project/session',
      BROWSERBASE_API_KEY: 'bb-key',
    } as unknown as Config

    expect(resolveBrowserGatewayProviderConfig(config)).toMatchObject({
      providerKind: 'playwright',
      selectedReason: 'lucid_playwright_default',
      disabledCandidates: ['browserbase'],
      externalProvidersEnabled: false,
    })
  })

  it('selects Steel as a CDP provider when the gateway-specific websocket endpoint is configured', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED: true,
      STEEL_CDP_WS_URL: 'wss://connect.steel.dev/session',
      STEEL_API_KEY: 'steel-key',
    } as unknown as Config

    expect(resolveBrowserGatewayProviderConfig(config)).toMatchObject({
      providerKind: 'steel',
      cdpWsUrl: 'wss://connect.steel.dev/session',
      cdpToken: 'steel-key',
    })
  })

  it('keeps BYO remote CDP disabled until the BYO flag is enabled', () => {
    expect(resolveBrowserGatewayProviderConfig({
      ...BASE_CONFIG,
      REMOTE_CDP_WS_URL: 'wss://customer.example/cdp',
    } as unknown as Config)).toMatchObject({
      providerKind: 'playwright',
      disabledCandidates: ['remote-cdp'],
      byoProvidersEnabled: false,
    })

    expect(resolveBrowserGatewayProviderConfig({
      ...BASE_CONFIG,
      BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED: true,
      REMOTE_CDP_WS_URL: 'wss://customer.example/cdp',
    } as unknown as Config)).toMatchObject({
      providerKind: 'remote-cdp',
      cdpWsUrl: 'wss://customer.example/cdp',
      byoProvidersEnabled: true,
    })
  })

  it('forces Playwright when an explicit external provider is configured but disabled', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_GATEWAY_PROVIDER: 'steel',
      STEEL_CDP_WS_URL: 'wss://connect.steel.dev/session',
      STEEL_API_KEY: 'steel-key',
    } as unknown as Config

    expect(resolveBrowserGatewayProviderConfig(config)).toMatchObject({
      providerKind: 'playwright',
      selectedReason: 'explicit_external_provider_disabled',
      disabledCandidates: ['steel'],
    })
  })

  it('routes Browser Use as an optional action layer without changing lifecycle provider', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_ACTION_LAYER: 'browser-use',
      BROWSER_USE_CONTROL_URL: 'https://browser-use.internal/act',
      BROWSER_USE_API_KEY: 'browser-use-key',
    } as unknown as Config

    expect(resolveBrowserGatewayProviderConfig(config)).toMatchObject({
      providerKind: 'playwright',
      actionLayer: 'browser-use',
      actionLayerControlUrl: 'https://browser-use.internal/act',
      actionLayerApiKey: 'browser-use-key',
    })
  })
})
