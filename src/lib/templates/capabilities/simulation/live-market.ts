import type {
  Web3SimulationEvidenceFixture,
  Web3SimulationScenario,
  Web3SimulationSignalFixture,
} from './web3-fixtures'

export interface LiveWeb3EthereumSnapshot {
  blockNumber: number
  rpcUrl: string
}

export interface LiveWeb3DexSnapshot {
  source: 'dexscreener'
  chainId: string
  dexId: string
  pairAddress: string
  baseSymbol: string
  quoteSymbol: string
  priceUsd: string | null
  liquidityUsd: number | null
  volume24hUsd: number | null
  priceChange24hPct: number | null
}

export interface LiveWeb3PredictionMarketSnapshot {
  source: 'polymarket-gamma'
  question: string
  slug: string | null
  volume: number | null
  liquidity: number | null
}

export interface LiveWeb3MarketSnapshot {
  fetchedAt: string
  ethereum?: LiveWeb3EthereumSnapshot
  dex?: LiveWeb3DexSnapshot
  predictionMarket?: LiveWeb3PredictionMarketSnapshot
  warnings: string[]
  sourceStatuses: Record<string, 'live' | 'failed' | 'fixture_fallback'>
}

export interface FetchLiveWeb3MarketSnapshotOptions {
  allowFixtureFallback?: boolean
  timeoutMs?: number
  ethereumRpcUrl?: string
}

const DEFAULT_ETHEREUM_RPC_URL = 'https://ethereum.publicnode.com'
const DEXSCREENER_SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search?q=ETH%20USDC'
const POLYMARKET_MARKETS_URL = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5'

export async function fetchLiveWeb3MarketSnapshot(
  options: FetchLiveWeb3MarketSnapshotOptions = {},
): Promise<LiveWeb3MarketSnapshot> {
  const timeoutMs = options.timeoutMs ?? 10_000
  const rpcUrl = options.ethereumRpcUrl
    ?? process.env.WEB3_ETHEREUM_RPC_URL
    ?? DEFAULT_ETHEREUM_RPC_URL
  const warnings: string[] = []
  const sourceStatuses: LiveWeb3MarketSnapshot['sourceStatuses'] = {}

  const [ethereum, dex, predictionMarket] = await Promise.all([
    fetchEthereumSnapshot(rpcUrl, timeoutMs).catch((error: unknown) => {
      sourceStatuses.ethereum = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`ethereum_rpc failed: ${formatError(error)}`)
      return undefined
    }),
    fetchDexSnapshot(timeoutMs).catch((error: unknown) => {
      sourceStatuses.dexscreener = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`dexscreener failed: ${formatError(error)}`)
      return undefined
    }),
    fetchPredictionMarketSnapshot(timeoutMs).catch((error: unknown) => {
      sourceStatuses.polymarket = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`polymarket_gamma failed: ${formatError(error)}`)
      return undefined
    }),
  ])

  if (ethereum) sourceStatuses.ethereum = 'live'
  if (dex) sourceStatuses.dexscreener = 'live'
  if (predictionMarket) sourceStatuses.polymarket = 'live'

  const liveSourceCount = [ethereum, dex, predictionMarket].filter(Boolean).length
  if (warnings.length > 0 && !options.allowFixtureFallback) {
    throw new Error(`One or more live Web3 market sources were unavailable: ${warnings.join('; ')}`)
  }
  if (liveSourceCount === 0 && !options.allowFixtureFallback) {
    throw new Error(`No live Web3 market sources were reachable: ${warnings.join('; ')}`)
  }

  return {
    fetchedAt: new Date().toISOString(),
    ethereum,
    dex,
    predictionMarket,
    warnings,
    sourceStatuses,
  }
}

export function buildLiveWeb3Scenario(input: {
  scenario: Web3SimulationScenario
  snapshot: LiveWeb3MarketSnapshot
}): Web3SimulationScenario {
  const liveSignals = buildLiveSignals(input.snapshot)
  const liveEvidence = buildLiveEvidence(input.snapshot)
  const liveTerms = buildLiveExpectedTerms(input.snapshot)

  return {
    ...input.scenario,
    signals: [
      ...input.scenario.signals,
      ...liveSignals,
    ],
    evidence: [
      ...input.scenario.evidence,
      ...liveEvidence,
    ],
    expectedTerms: Array.from(new Set([
      ...input.scenario.expectedTerms,
      ...liveTerms,
    ])),
  }
}

function buildLiveSignals(snapshot: LiveWeb3MarketSnapshot): Web3SimulationSignalFixture[] {
  const signals: Web3SimulationSignalFixture[] = []
  if (snapshot.ethereum) {
    signals.push({
      label: 'Live Ethereum block',
      value: `Ethereum RPC live at block ${snapshot.ethereum.blockNumber}`,
      severity: 'info',
    })
  }
  if (snapshot.dex) {
    signals.push({
      label: 'Live DEX market',
      value: `${snapshot.dex.baseSymbol}/${snapshot.dex.quoteSymbol} on ${snapshot.dex.dexId}: price ${snapshot.dex.priceUsd ?? 'n/a'}, liquidity ${formatUsd(snapshot.dex.liquidityUsd)}, 24h volume ${formatUsd(snapshot.dex.volume24hUsd)}`,
      severity: Math.abs(snapshot.dex.priceChange24hPct ?? 0) >= 5 ? 'watch' : 'info',
    })
  }
  if (snapshot.predictionMarket) {
    signals.push({
      label: 'Live prediction market',
      value: `${snapshot.predictionMarket.question} volume ${formatUsd(snapshot.predictionMarket.volume)}, liquidity ${formatUsd(snapshot.predictionMarket.liquidity)}`,
      severity: 'info',
    })
  }
  return signals
}

function buildLiveEvidence(snapshot: LiveWeb3MarketSnapshot): Web3SimulationEvidenceFixture[] {
  const evidence: Web3SimulationEvidenceFixture[] = []
  if (snapshot.ethereum) {
    evidence.push({
      kind: 'live_chain_state',
      source: 'live:ethereum_rpc',
      value: `block=${snapshot.ethereum.blockNumber} rpc=${snapshot.ethereum.rpcUrl}`,
    })
  }
  if (snapshot.dex) {
    evidence.push({
      kind: 'live_dex_pair',
      source: 'live:dexscreener',
      value: `${snapshot.dex.chainId}/${snapshot.dex.dexId} ${snapshot.dex.baseSymbol}/${snapshot.dex.quoteSymbol} priceUsd=${snapshot.dex.priceUsd ?? 'n/a'} liquidityUsd=${snapshot.dex.liquidityUsd ?? 'n/a'} volume24hUsd=${snapshot.dex.volume24hUsd ?? 'n/a'} pair=${snapshot.dex.pairAddress}`,
    })
  }
  if (snapshot.predictionMarket) {
    evidence.push({
      kind: 'live_prediction_market',
      source: 'live:polymarket_gamma',
      value: `question="${snapshot.predictionMarket.question}" slug=${snapshot.predictionMarket.slug ?? 'n/a'} volume=${snapshot.predictionMarket.volume ?? 'n/a'} liquidity=${snapshot.predictionMarket.liquidity ?? 'n/a'}`,
    })
  }
  return evidence
}

function buildLiveExpectedTerms(snapshot: LiveWeb3MarketSnapshot): string[] {
  const terms = ['live']
  if (snapshot.ethereum) terms.push(String(snapshot.ethereum.blockNumber))
  if (snapshot.dex) terms.push(snapshot.dex.baseSymbol, snapshot.dex.quoteSymbol)
  return terms
}

async function fetchEthereumSnapshot(rpcUrl: string, timeoutMs: number): Promise<LiveWeb3EthereumSnapshot> {
  const response = await fetchWithTimeout(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_blockNumber',
      params: [],
    }),
  }, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json() as { result?: string, error?: { message?: string } }
  if (payload.error) throw new Error(payload.error.message ?? 'ethereum rpc error')
  if (!payload.result) throw new Error('missing block number')
  return {
    blockNumber: Number.parseInt(payload.result, 16),
    rpcUrl,
  }
}

async function fetchDexSnapshot(timeoutMs: number): Promise<LiveWeb3DexSnapshot> {
  const response = await fetchWithTimeout(DEXSCREENER_SEARCH_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'LucidCapabilityTemplateSimulation/1.0',
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json() as {
    pairs?: Array<{
      chainId?: string
      dexId?: string
      pairAddress?: string
      baseToken?: { symbol?: string }
      quoteToken?: { symbol?: string }
      priceUsd?: string
      liquidity?: { usd?: number }
      volume?: { h24?: number }
      priceChange?: { h24?: number }
    }>
  }
  const pair = payload.pairs?.find((item) => item.chainId && item.baseToken?.symbol && item.quoteToken?.symbol)
  if (!pair) throw new Error('missing dex pair')
  return {
    source: 'dexscreener',
    chainId: pair.chainId ?? 'unknown',
    dexId: pair.dexId ?? 'unknown',
    pairAddress: pair.pairAddress ?? 'unknown',
    baseSymbol: pair.baseToken?.symbol ?? 'UNKNOWN',
    quoteSymbol: pair.quoteToken?.symbol ?? 'UNKNOWN',
    priceUsd: pair.priceUsd ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    priceChange24hPct: pair.priceChange?.h24 ?? null,
  }
}

async function fetchPredictionMarketSnapshot(timeoutMs: number): Promise<LiveWeb3PredictionMarketSnapshot> {
  const response = await fetchWithTimeout(POLYMARKET_MARKETS_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'LucidCapabilityTemplateSimulation/1.0',
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json() as Array<{
    question?: string
    slug?: string
    volume?: string | number
    liquidity?: string | number
  }>
  const market = payload.find((item) => item.question)
  if (!market?.question) throw new Error('missing prediction market')
  return {
    source: 'polymarket-gamma',
    question: market.question,
    slug: market.slug ?? null,
    volume: numberOrNull(market.volume),
    liquidity: numberOrNull(market.liquidity),
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function numberOrNull(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatUsd(value: number | null): string {
  if (value === null) return 'n/a'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
