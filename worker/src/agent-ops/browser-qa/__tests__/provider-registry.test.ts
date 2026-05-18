import { afterEach, describe, expect, it } from 'vitest'

import type { Config } from '../../../config.js'
import {
  resolveBrowserQaProvider,
  resolveBrowserQaProviderConfig,
} from '../provider-registry.js'

const BASE_CONFIG = {
  BROWSER_QA_TIMEOUT_MS: 30_000,
} as unknown as Config

const originalEnv = { ...process.env }

describe('Browser QA provider registry', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('uses the generic Lucid managed browser-control contract by default', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_CONTROL_URL: 'https://browser.internal',
      BROWSER_QA_CONTROL_TOKEN: 'token',
    } as unknown as Config

    const providerConfig = resolveBrowserQaProviderConfig(config)
    const provider = resolveBrowserQaProvider(config)

    expect(providerConfig).toMatchObject({
      kind: 'lucid-managed',
      baseUrl: 'https://browser.internal',
      token: 'token',
    })
    expect(provider?.kind).toBe('lucid-managed')
  })

  it('keeps Hermes behind the same provider contract when a Hermes endpoint is configured', () => {
    process.env.HERMES_BROWSER_CONTROL_URL = 'https://hermes-browser.internal'
    process.env.HERMES_BROWSER_CONTROL_TOKEN = 'hermes-token'

    const providerConfig = resolveBrowserQaProviderConfig(BASE_CONFIG)
    const provider = resolveBrowserQaProvider(BASE_CONFIG)

    expect(providerConfig).toMatchObject({
      kind: 'hermes',
      baseUrl: 'https://hermes-browser.internal',
      token: 'hermes-token',
    })
    expect(provider?.kind).toBe('hermes')
  })

  it('selects Steel without requiring Agent Ops workflow changes', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_PROVIDER: 'steel',
      STEEL_BROWSER_URL: 'https://steel.internal',
      STEEL_API_KEY: 'steel-key',
    } as unknown as Config

    const providerConfig = resolveBrowserQaProviderConfig(config)
    const provider = resolveBrowserQaProvider(config)

    expect(providerConfig).toMatchObject({
      kind: 'steel',
      baseUrl: 'https://steel.internal',
      token: 'steel-key',
    })
    expect(provider?.kind).toBe('steel')
  })

  it('accepts legacy provider aliases without failing worker config parsing', () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_PROVIDER: 'openclaw',
      BROWSER_QA_CONTROL_URL: 'https://browser.internal',
    } as unknown as Config

    const providerConfig = resolveBrowserQaProviderConfig(config)

    expect(providerConfig).toMatchObject({
      kind: 'openclaw-compatible',
      baseUrl: 'https://browser.internal',
    })
  })

  it('does not allow local Playwright to silently run in the shared worker process', async () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_PROVIDER: 'playwright',
    } as unknown as Config

    const provider = resolveBrowserQaProvider(config)

    expect(provider?.kind).toBe('playwright')
    await expect(provider?.startSession({
      targetUrl: 'https://example.com',
      runId: 'run-1',
      stepId: 'step-1',
    })).rejects.toThrow(/isolated browser worker/i)
  })

  it('keeps Browserless behind the isolated Browser Operator gateway', async () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_PROVIDER: 'browserless',
    } as unknown as Config

    const provider = resolveBrowserQaProvider(config)

    expect(provider?.kind).toBe('browserless')
    await expect(provider?.startSession({
      targetUrl: 'https://example.com',
      runId: 'run-1',
      stepId: 'step-1',
    })).rejects.toThrow(/Lucid browser gateway/i)
  })

  it('keeps Stagehand behind the isolated Browser Operator gateway action layer', async () => {
    const config = {
      ...BASE_CONFIG,
      BROWSER_QA_PROVIDER: 'stagehand',
    } as unknown as Config

    const provider = resolveBrowserQaProvider(config)

    expect(provider?.kind).toBe('stagehand')
    await expect(provider?.startSession({
      targetUrl: 'https://example.com',
      runId: 'run-1',
      stepId: 'step-1',
    })).rejects.toThrow(/behind the Lucid Browser QA gateway/i)
  })
})
