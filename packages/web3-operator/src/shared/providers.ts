/**
 * Provider Registry — single source of truth for all external API providers.
 *
 * Three concerns live here:
 *   1. Provider configs  — URLs, keys, rate limits, headers
 *   2. Fallback chains   — which providers to try, in what order, per capability+chain
 *   3. Circuit breaker   — tracks provider health, skips recently-failed providers
 *
 * Modeled after ethers.js FallbackProvider + Vercel AI SDK provider pattern.
 *
 * To add a new provider (e.g. Birdeye):
 *   1. Add its config to PROVIDERS
 *   2. Insert it into FALLBACK_CHAINS at the desired position
 *   3. Register its fetcher via registerFetcher('price', 'birdeye', fetchBirdeyePrice)
 *   — No other files need to change —
 *
 * To reorder fallback priority:
 *   1. Edit FALLBACK_CHAINS — that's it
 *
 * All API keys, base URLs, rate limits, headers, fallback order, and health
 * tracking live HERE. Tool files never hardcode provider URLs, read API key
 * env vars, decide fallback order, or track provider health.
 */

// ── Provider Config Type ────────────────────────────────────────────

export interface ProviderConfig {
  /** Human-readable name */
  name: string
  /** Base URL (no trailing slash) */
  baseUrl: string
  /** API key (undefined = not configured or free tier) */
  apiKey?: string
  /** Custom headers to include on every request */
  headers: Record<string, string>
  /** Rate limit: max burst tokens */
  rateLimit: { maxTokens: number; refillRate: number }
  /** Whether this provider is available (key required but missing = false) */
  available: boolean
}

// ── Provider Registry ───────────────────────────────────────────────

/**
 * All external providers in one place.
 * Env var reads happen at module load (standard Node.js pattern).
 */
export const PROVIDERS = {
  // ── Price / Swap / Token APIs ──────────────────────────────────────

  jupiter: {
    name: 'Jupiter',
    baseUrl: process.env.JUPITER_API_URL || 'https://api.jup.ag',
    apiKey: process.env.JUPITER_API_KEY,
    get headers(): Record<string, string> {
      const h: Record<string, string> = {}
      if (this.apiKey) h['x-api-key'] = this.apiKey
      return h
    },
    rateLimit: { maxTokens: 50, refillRate: 0.8 },   // ~48/min (free tier: 60)
    get available() { return true }, // Works without key, just slower
  },

  dexscreener: {
    name: 'DexScreener',
    baseUrl: process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com',
    apiKey: undefined,
    headers: {},
    rateLimit: { maxTokens: 30, refillRate: 0.5 },   // ~30/min
    available: true, // Free, no key required
  },

  zerox: {
    name: '0x Protocol',
    baseUrl: process.env.ZEROX_API_URL || 'https://api.0x.org',
    apiKey: process.env.ZEROX_API_KEY,
    get headers(): Record<string, string> {
      const h: Record<string, string> = { '0x-version': 'v2' }
      if (this.apiKey) h['0x-api-key'] = this.apiKey
      return h
    },
    rateLimit: { maxTokens: 40, refillRate: 0.67 },   // ~40/min
    get available() { return !!this.apiKey },
  },

  // ── Transaction History ─────────────────────────────────────────────

  helius: {
    name: 'Helius',
    baseUrl: process.env.HELIUS_API_URL || 'https://api.helius.xyz',
    apiKey: process.env.HELIUS_API_KEY,
    get headers(): Record<string, string> {
      return {} // Helius uses query-param auth (api-key=), not headers
    },
    rateLimit: { maxTokens: 40, refillRate: 0.67 },   // ~40/min
    get available() { return !!this.apiKey },
  },

  // ── Bridge ──────────────────────────────────────────────────────────

  debridge: {
    name: 'DeBridge',
    baseUrl: process.env.DEBRIDGE_API_URL || 'https://deswap.debridge.finance/v1.0',
    apiKey: undefined,
    headers: {},
    rateLimit: { maxTokens: 20, refillRate: 0.33 },   // ~20/min
    available: true, // Free, no key required
  },
} as const satisfies Record<string, ProviderConfig>

export type ProviderId = keyof typeof PROVIDERS

// ── Typed Accessors (what tool files import) ────────────────────────

/** Jupiter API: prices, token search, limit orders, DCA (Solana-primary). */
export function jupiter() {
  return PROVIDERS.jupiter
}

/** DexScreener API: prices, token search (multi-chain fallback). */
export function dexscreener() {
  return PROVIDERS.dexscreener
}

/** 0x Protocol API: EVM swap quotes (requires ZEROX_API_KEY). */
export function zerox() {
  return PROVIDERS.zerox
}

/** Helius API: Solana transaction history, enhanced transactions (requires HELIUS_API_KEY). */
export function helius() {
  return PROVIDERS.helius
}

/** DeBridge DLN API: cross-chain bridge quotes (free). */
export function debridge() {
  return PROVIDERS.debridge
}

// ── URL Builders (convenience) ──────────────────────────────────────

/** Build a full URL for a provider endpoint. */
export function providerUrl(provider: ProviderId, path: string): string {
  return `${PROVIDERS[provider].baseUrl}${path}`
}

// ── Missing Key Warnings (one-time per process) ─────────────────────

const _warned = new Set<string>()

export function warnIfMissing(provider: ProviderId): void {
  const p = PROVIDERS[provider]
  if (p.available || _warned.has(provider)) return
  _warned.add(provider)
  console.warn(`[web3-operator] ${p.name} API key not configured — provider unavailable. Set the required env var.`)
}

// ── Circuit Breaker ─────────────────────────────────────────────────
//
// Tracks provider health per capability. When a provider fails N times
// consecutively, it's marked "open" (skipped) for a cooldown period.
// After cooldown, one request is allowed through (half-open). If it
// succeeds, the breaker resets. If it fails, it re-opens.
//
// Modeled after: Netflix Hystrix, opossum, services/chain/circuit-breaker.ts

const BREAKER_THRESHOLD = 3      // consecutive failures before opening
const BREAKER_COOLDOWN_MS = 30_000 // 30s cooldown before half-open retry

interface BreakerState {
  failures: number
  state: 'closed' | 'open' | 'half-open'
  lastFailure: number
}

const breakers = new Map<string, BreakerState>()

function breakerKey(capability: string, provider: ProviderId): string {
  return `${capability}:${provider}`
}

function getBreaker(key: string): BreakerState {
  let b = breakers.get(key)
  if (!b) {
    b = { failures: 0, state: 'closed', lastFailure: 0 }
    breakers.set(key, b)
  }
  return b
}

function shouldSkip(capability: string, provider: ProviderId): boolean {
  const b = getBreaker(breakerKey(capability, provider))
  if (b.state === 'closed') return false
  if (b.state === 'open') {
    // Check if cooldown expired → transition to half-open
    if (Date.now() - b.lastFailure >= BREAKER_COOLDOWN_MS) {
      b.state = 'half-open'
      return false // allow one probe request
    }
    return true // still cooling down
  }
  // half-open: allow the probe through
  return false
}

function recordSuccess(capability: string, provider: ProviderId): void {
  const key = breakerKey(capability, provider)
  const b = getBreaker(key)
  b.failures = 0
  b.state = 'closed'
}

function recordFailure(capability: string, provider: ProviderId): void {
  const key = breakerKey(capability, provider)
  const b = getBreaker(key)
  b.failures++
  b.lastFailure = Date.now()
  if (b.failures >= BREAKER_THRESHOLD) {
    b.state = 'open'
  }
}

/** Expose breaker state for observability / debugging. */
export function getProviderHealth(): Record<string, { state: string; failures: number }> {
  const health: Record<string, { state: string; failures: number }> = {}
  for (const [key, b] of breakers) {
    health[key] = { state: b.state, failures: b.failures }
  }
  return health
}

/** Reset a specific provider's circuit breaker (e.g. after config change). */
export function resetBreaker(capability: Capability, provider: ProviderId): void {
  breakers.delete(breakerKey(capability, provider))
}

// ── Fallback Chains ─────────────────────────────────────────────────
//
// Defines which providers to try, in what order, for each capability + chain.
// "_default" is used when no chain-specific entry exists.
//
// To swap provider priority: just reorder the arrays below.
// To add a new provider: add it to PROVIDERS above, then insert here.

export type Capability = 'price' | 'search' | 'swap_quote' | 'bridge' | 'history'

export const FALLBACK_CHAINS: Record<Capability, Record<string, ProviderId[]>> = {
  price: {
    solana:   ['jupiter', 'dexscreener'],
    ethereum: ['zerox', 'dexscreener', 'jupiter'], // Jupiter last = wrapped token fallback
    base:     ['zerox', 'dexscreener'],
    polygon:  ['zerox', 'dexscreener'],
    arbitrum: ['zerox', 'dexscreener'],
    _default: ['dexscreener'],
  },
  search: {
    solana:   ['jupiter', 'dexscreener'],
    _default: ['dexscreener'],
  },
  swap_quote: {
    _default: ['zerox'],
  },
  bridge: {
    _default: ['debridge'],
  },
  history: {
    solana:   ['helius'],
    _default: [], // EVM uses RPC directly (QuickNode qn_getTransactionsByAddress)
  },
}

/**
 * Get the ordered fallback chain for a capability on a given chain.
 * Filters out providers that aren't available (missing API key)
 * and providers whose circuit breaker is open.
 */
export function getFallbackChain(capability: Capability, chain: string): ProviderId[] {
  const chains = FALLBACK_CHAINS[capability]
  const order = chains[chain] || chains['_default'] || []
  return order.filter(id =>
    PROVIDERS[id].available && !shouldSkip(capability, id),
  )
}

// ── Fetcher Registry ────────────────────────────────────────────────
//
// Tool files register their provider-specific fetchers here at module
// load time. withFallback() consumes them — tool files don't build
// fetcher maps inline.
//
// This means adding a new provider = one registerFetcher() call in
// the tool file, not editing every function that does fallback.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFetcher = (...args: any[]) => Promise<any>

const fetcherRegistry = new Map<string, Map<ProviderId, AnyFetcher>>()

function registryKey(capability: Capability): string {
  return capability
}

/**
 * Register a fetcher for a capability + provider.
 * Called once at module load time by each tool file.
 *
 * Example (in get-price.ts):
 *   registerFetcher('price', 'jupiter', fetchJupiterPrice)
 *   registerFetcher('price', 'dexscreener', fetchDexScreenerPrice)
 *   registerFetcher('price', 'zerox', fetch0xPrice)
 */
export function registerFetcher<T>(
  capability: Capability,
  provider: ProviderId,
  fetcher: (...args: unknown[]) => Promise<T | null>,
): void {
  const key = registryKey(capability)
  let map = fetcherRegistry.get(key)
  if (!map) {
    map = new Map()
    fetcherRegistry.set(key, map)
  }
  map.set(provider, fetcher)
}

/**
 * Get all registered fetchers for a capability, in fallback order.
 * Returns only fetchers whose providers are available and healthy.
 */
export function getRegisteredFetchers<T>(
  capability: Capability,
  chain: string,
): Array<{ provider: ProviderId; fetcher: (...args: unknown[]) => Promise<T | null> }> {
  const order = getFallbackChain(capability, chain)
  const map = fetcherRegistry.get(registryKey(capability))
  if (!map) return []
  return order
    .filter(id => map.has(id))
    .map(id => ({ provider: id, fetcher: map.get(id)! as (...args: unknown[]) => Promise<T | null> }))
}

// ── withFallback ────────────────────────────────────────────────────

/**
 * Run provider-specific fetchers in fallback order with circuit breaking.
 *
 * Each fetcher is keyed by ProviderId. They're tried in the order
 * defined by FALLBACK_CHAINS. First non-null result wins.
 * Failed providers are tracked by the circuit breaker.
 *
 * Usage in tool files:
 *   const price = await withFallback('price', chain, {
 *     jupiter:      () => fetchJupiterPrice(address),
 *     dexscreener:  () => fetchDexScreenerPrice(address, chain),
 *     zerox:        () => fetch0xPrice(address, chain),
 *   })
 */
export async function withFallback<T>(
  capability: Capability,
  chain: string,
  fetchers: Partial<Record<ProviderId, () => Promise<T | null>>>,
): Promise<T | null> {
  const order = getFallbackChain(capability, chain)
  for (const providerId of order) {
    const fetcher = fetchers[providerId]
    if (!fetcher) continue
    try {
      const result = await fetcher()
      if (result !== null) {
        recordSuccess(capability, providerId)
        return result
      }
      // null = no data (not an error), don't count as failure
    } catch {
      recordFailure(capability, providerId)
    }
  }
  return null
}

// ── Rate Limit Integration ──────────────────────────────────────────

/**
 * Build the HOST_LIMITS map that rate-limit.ts consumes.
 * Derived from PROVIDERS so there's one source of truth.
 */
export function buildHostLimits(): Record<string, { maxTokens: number; refillRate: number }> {
  const limits: Record<string, { maxTokens: number; refillRate: number }> = {}
  for (const p of Object.values(PROVIDERS)) {
    try {
      const host = new URL(p.baseUrl).hostname
      limits[host] = p.rateLimit
    } catch { /* skip invalid URLs */ }
  }
  return limits
}
