/**
 * web3-operator — Dependency injection configuration.
 *
 * Allows the package to run without importing LucidMerged internals.
 * Call initWeb3Operator() at worker startup to inject:
 *   - RPC URL resolver
 *   - Tool result cache
 *   - Snapshot store (abstract persistence — no Supabase dependency)
 *   - API keys (override env vars)
 *
 * When not initialized, falls back to env-based defaults.
 */

import type { PortfolioSnapshot } from '@lucid-fdn/web3-types'

// ── Abstract persistence interface ──────────────────────────────────

export interface SnapshotStore {
  get(id: string): Promise<PortfolioSnapshot | null>
  put(snapshot: PortfolioSnapshot): Promise<void>
  list(assistantId: string, options?: { label?: string; limit?: number }): Promise<PortfolioSnapshot[]>
  delete?(id: string): Promise<void>
}

// ── Tool cache interface ────────────────────────────────────────────

export interface ToolCacheInterface {
  get(tool: string, key: string): string | undefined
  set(tool: string, key: string, value: string): void
}

// ── Config interface ────────────────────────────────────────────────

export interface Web3OperatorConfig {
  /** Resolve RPC URL for a chain. Returns URL string or undefined. */
  rpcUrlResolver?: (chain: string, network?: string) => string | undefined
  /** Optional tool result cache. */
  toolCache?: ToolCacheInterface
  /** Optional abstract persistence for portfolio snapshots. */
  snapshotStore?: SnapshotStore
  /** Provider API keys (override env vars). */
  apiKeys?: {
    jupiter?: string
    helius?: string
    zerox?: string
  }
}

// ── Module-level state ──────────────────────────────────────────────

let _config: Web3OperatorConfig = {}
let _initialized = false

/**
 * Initialize web3-operator with injected dependencies.
 * Call once at worker startup.
 */
export function initWeb3Operator(config: Web3OperatorConfig): void {
  _config = config
  _initialized = true
}

// ── Default RPC resolver (env-based, matches existing behavior) ─────

const CHAIN_RPC_ENVS: Record<string, string> = {
  solana: 'SOLANA_RPC_URL',
  ethereum: 'ETHEREUM_RPC_URL',
  base: 'BASE_RPC_URL',
  polygon: 'POLYGON_RPC_URL',
  arbitrum: 'ARBITRUM_RPC_URL',
}

const DEFAULT_RPCS: Record<string, string> = {
  solana: 'https://api.mainnet-beta.solana.com',
}

function defaultRpcResolver(chain: string): string | undefined {
  const envKey = CHAIN_RPC_ENVS[chain]
  if (envKey && process.env[envKey]) return process.env[envKey]
  return DEFAULT_RPCS[chain]
}

// ── In-memory snapshot store (default) ──────────────────────────────

const memorySnapshots = new Map<string, PortfolioSnapshot[]>()

const inMemorySnapshotStore: SnapshotStore = {
  async get(id: string) {
    for (const snapshots of memorySnapshots.values()) {
      const found = snapshots.find(s => s.id === id)
      if (found) return found
    }
    return null
  },
  async put(snapshot: PortfolioSnapshot) {
    const key = snapshot.assistantId
    const existing = memorySnapshots.get(key) || []
    existing.push(snapshot)
    if (existing.length > 100) existing.shift()
    memorySnapshots.set(key, existing)
  },
  async list(assistantId: string, options?: { label?: string; limit?: number }) {
    const limit = options?.limit || 10
    const all = memorySnapshots.get(assistantId) || []
    const filtered = options?.label
      ? all.filter(s => s.label === options.label)
      : all
    return filtered.slice(-limit).reverse()
  },
}

// ── No-op tool cache (default) ──────────────────────────────────────

const noopCache: ToolCacheInterface = {
  get() { return undefined },
  set() { /* no-op */ },
}

// ── Public accessor ─────────────────────────────────────────────────

export interface ResolvedConfig {
  rpcUrlResolver: (chain: string, network?: string) => string | undefined
  toolCache: ToolCacheInterface
  snapshotStore: SnapshotStore
  apiKeys: {
    jupiter?: string
    helius?: string
    zerox?: string
  }
}

/**
 * Get resolved config with defaults applied.
 * Safe to call before init — returns sensible defaults.
 */
export function getConfig(): ResolvedConfig {
  return {
    rpcUrlResolver: _config.rpcUrlResolver ?? defaultRpcResolver,
    toolCache: _config.toolCache ?? noopCache,
    snapshotStore: _config.snapshotStore ?? inMemorySnapshotStore,
    apiKeys: {
      jupiter: _config.apiKeys?.jupiter ?? process.env.JUPITER_API_KEY,
      helius: _config.apiKeys?.helius ?? process.env.HELIUS_API_KEY,
      zerox: _config.apiKeys?.zerox ?? process.env.ZEROX_API_KEY,
    },
  }
}

/** Check if init was called (for diagnostics). */
export function isInitialized(): boolean {
  return _initialized
}
