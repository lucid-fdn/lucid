import type { Config } from '../../config.js'
import { OpenClawCompatibleBrowserQaProvider } from './providers/openclaw-compatible.js'
import { SteelBrowserQaProvider } from './providers/steel.js'
import { UnsupportedBrowserQaProvider } from './providers/unsupported.js'
import type { BrowserQaProvider, BrowserQaProviderConfig, BrowserQaProviderKind } from './types.js'

const SUPPORTED_PROVIDER_KINDS = new Set<BrowserQaProviderKind>([
  'lucid-managed',
  'steel',
  'playwright',
  'browserless',
  'stagehand',
  'openclaw-compatible',
  'hermes',
  'remote-cdp',
])

export function resolveBrowserQaProvider(config: Config): BrowserQaProvider | null {
  const providerConfig = resolveBrowserQaProviderConfig(config)
  if (!providerConfig) return null

  switch (providerConfig.kind) {
    case 'lucid-managed':
    case 'openclaw-compatible':
    case 'hermes':
    case 'remote-cdp':
      return new OpenClawCompatibleBrowserQaProvider(providerConfig)
    case 'steel':
      return new SteelBrowserQaProvider(providerConfig)
    case 'playwright':
      return new UnsupportedBrowserQaProvider(
        'playwright',
        'Playwright Browser QA must run in an isolated browser worker or dedicated runtime profile, not the shared worker process.',
      )
    case 'browserless':
      return new UnsupportedBrowserQaProvider(
        'browserless',
        'Browserless Browser QA adapter is not configured in this worker build yet. Use the Lucid browser gateway or a remote browser-control endpoint.',
      )
    case 'stagehand':
      return new UnsupportedBrowserQaProvider(
        'stagehand',
        'Stagehand is an action/extraction layer and must sit behind the Lucid Browser QA gateway before direct worker use.',
      )
    default:
      return null
  }
}

export function resolveBrowserQaProviderConfig(config: Config): BrowserQaProviderConfig | null {
  const explicitKind = normalizeProviderKind(
    getString(config.BROWSER_QA_PROVIDER)
      ?? process.env.BROWSER_QA_PROVIDER,
  )

  if (explicitKind === 'steel') {
    return {
      kind: 'steel',
      baseUrl: getString(config.STEEL_BROWSER_URL)
        ?? process.env.STEEL_BROWSER_URL
        ?? 'https://api.steel.dev',
      token: getString(config.STEEL_API_KEY)
        ?? process.env.STEEL_API_KEY
        ?? config.BROWSER_QA_CONTROL_TOKEN,
      password: config.BROWSER_QA_CONTROL_PASSWORD,
      profile: config.BROWSER_QA_PROFILE,
      timeoutMs: config.BROWSER_QA_TIMEOUT_MS,
    }
  }

  if (explicitKind && !requiresHttpControlUrl(explicitKind)) {
    return {
      kind: explicitKind,
      baseUrl: 'http://localhost',
      token: config.BROWSER_QA_CONTROL_TOKEN,
      password: config.BROWSER_QA_CONTROL_PASSWORD,
      profile: config.BROWSER_QA_PROFILE,
      timeoutMs: config.BROWSER_QA_TIMEOUT_MS,
    }
  }

  const inferredKind = explicitKind
    ?? inferProviderKind(config)
  const baseUrl = getControlUrl(config, inferredKind)
  if (!baseUrl) return null

  return {
    kind: inferredKind,
    baseUrl,
    token: getProviderToken(config, inferredKind),
    password: getProviderPassword(config, inferredKind),
    profile: getProviderProfile(config, inferredKind),
    timeoutMs: config.BROWSER_QA_TIMEOUT_MS,
  }
}

function inferProviderKind(config: Config): BrowserQaProviderKind {
  if (config.STEEL_BROWSER_URL || config.STEEL_API_KEY || process.env.STEEL_BROWSER_URL || process.env.STEEL_API_KEY) {
    return 'steel'
  }
  if (process.env.HERMES_BROWSER_CONTROL_URL) return 'hermes'
  if (config.BROWSER_QA_CONTROL_URL) return 'lucid-managed'
  return 'openclaw-compatible'
}

function getControlUrl(config: Config, kind: BrowserQaProviderKind): string | null {
  if (kind === 'steel') {
    return getString(config.STEEL_BROWSER_URL) ?? process.env.STEEL_BROWSER_URL ?? 'https://api.steel.dev'
  }
  if (kind === 'hermes') {
    return config.BROWSER_QA_CONTROL_URL
      ?? process.env.HERMES_BROWSER_CONTROL_URL
      ?? null
  }
  return config.BROWSER_QA_CONTROL_URL
    ?? process.env.OPENCLAW_BROWSER_CONTROL_URL
    ?? process.env.BROWSER_CONTROL_URL
    ?? null
}

function getProviderToken(config: Config, kind: BrowserQaProviderKind): string | undefined {
  if (kind === 'steel') {
    return getString(config.STEEL_API_KEY)
      ?? process.env.STEEL_API_KEY
      ?? config.BROWSER_QA_CONTROL_TOKEN
  }
  if (kind === 'hermes') {
    return config.BROWSER_QA_CONTROL_TOKEN
      ?? process.env.HERMES_BROWSER_CONTROL_TOKEN
      ?? undefined
  }
  return config.BROWSER_QA_CONTROL_TOKEN
    ?? process.env.OPENCLAW_BROWSER_CONTROL_TOKEN
    ?? undefined
}

function getProviderPassword(config: Config, kind: BrowserQaProviderKind): string | undefined {
  if (kind === 'hermes') {
    return config.BROWSER_QA_CONTROL_PASSWORD
      ?? process.env.HERMES_BROWSER_CONTROL_PASSWORD
      ?? undefined
  }
  return config.BROWSER_QA_CONTROL_PASSWORD
    ?? process.env.OPENCLAW_BROWSER_CONTROL_PASSWORD
    ?? undefined
}

function getProviderProfile(config: Config, kind: BrowserQaProviderKind): string | undefined {
  if (kind === 'hermes') {
    return config.BROWSER_QA_PROFILE
      ?? process.env.HERMES_BROWSER_PROFILE
      ?? undefined
  }
  return config.BROWSER_QA_PROFILE
    ?? process.env.OPENCLAW_BROWSER_PROFILE
    ?? undefined
}

function requiresHttpControlUrl(kind: BrowserQaProviderKind): boolean {
  return kind !== 'steel' && kind !== 'playwright' && kind !== 'browserless' && kind !== 'stagehand'
}

function normalizeProviderKind(value: unknown): BrowserQaProviderKind | null {
  const normalized = getString(value)?.toLowerCase().replace(/_/g, '-')
  if (!normalized) return null
  if (normalized === 'openclaw') return 'openclaw-compatible'
  if (SUPPORTED_PROVIDER_KINDS.has(normalized as BrowserQaProviderKind)) {
    return normalized as BrowserQaProviderKind
  }
  return null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
