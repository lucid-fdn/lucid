/**
 * Moralis API client — internal data provider for web3-operator tools.
 *
 * NOT exposed as a plugin. Used inside get_price, risk_check, etc.
 * Falls back gracefully if MORALIS_API_KEY is not set.
 */

const EVM_BASE = 'https://deep-index.moralis.io/api/v2.2'
const SOL_BASE = 'https://solana-gateway.moralis.io'

function getApiKey(): string | null {
  return process.env.MORALIS_API_KEY || null
}

async function moralisGet<T = unknown>(path: string, base = EVM_BASE): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('MORALIS_API_KEY not set')

  const res = await fetch(`${base}${path}`, {
    headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Moralis ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ── Token ─────────────────────────────────────────────────────────────

export async function getTokenPrice(address: string, chain = 'eth') {
  return moralisGet(`/erc20/${address}/price?chain=${chain}&include=percent_change`)
}

export async function getMultipleTokenPrices(tokens: Array<{ address: string; chain?: string }>) {
  return moralisGet('/erc20/prices', EVM_BASE)
    .catch(() => null) // POST endpoint, simplified here
}

export async function searchTokens(query: string, chain?: string) {
  const chainParam = chain ? `&chain=${chain}` : ''
  return moralisGet(`/tokens/search?query=${encodeURIComponent(query)}${chainParam}&limit=10`)
}

export async function getTokenScore(address: string, chain = 'eth') {
  return moralisGet(`/erc20/${address}/score?chain=${chain}`)
}

export async function getTokenStats(address: string, chain = 'eth') {
  return moralisGet(`/erc20/${address}/stats?chain=${chain}`)
}

export async function getTokenAnalytics(address: string, chain = 'eth') {
  return moralisGet(`/erc20/${address}/analytics?chain=${chain}`)
}

export async function getTokenPairs(address: string, chain = 'eth', limit = 5) {
  return moralisGet(`/erc20/${address}/pairs?chain=${chain}&limit=${limit}`)
}

export async function getTokenHolders(address: string, chain = 'eth') {
  return moralisGet(`/erc20/${address}/holders?chain=${chain}`)
}

export async function getTokenOwners(address: string, chain = 'eth', limit = 10) {
  return moralisGet(`/erc20/${address}/owners?chain=${chain}&limit=${limit}`)
}

export async function getHistoricalTokenHolders(address: string, chain = 'eth') {
  return moralisGet(`/erc20/${address}/holders/historical?chain=${chain}`)
}

// ── Discovery ─────────────────────────────────────────────────────────

export async function getTrendingTokens(chain?: string) {
  const chainParam = chain ? `?chain=${chain}` : ''
  return moralisGet(`/discovery/tokens/trending${chainParam}`)
}

export async function getTopGainers(chain?: string) {
  const chainParam = chain ? `?chain=${chain}` : ''
  return moralisGet(`/discovery/tokens/top-gainers${chainParam}`)
}

export async function getTopLosers(chain?: string) {
  const chainParam = chain ? `?chain=${chain}` : ''
  return moralisGet(`/discovery/tokens/top-losers${chainParam}`)
}

export async function getExperiencedBuyers(chain?: string) {
  const chainParam = chain ? `?chain=${chain}` : ''
  return moralisGet(`/discovery/tokens/experienced-buyers${chainParam}`)
}

export async function getBuyingPressure(chain?: string) {
  const chainParam = chain ? `?chain=${chain}` : ''
  return moralisGet(`/discovery/tokens/buying-pressure${chainParam}`)
}

export async function getRisingLiquidity(chain?: string) {
  const chainParam = chain ? `?chain=${chain}` : ''
  return moralisGet(`/discovery/tokens/rising-liquidity${chainParam}`)
}

export async function getFilteredTokens(filters: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) params.set(k, String(v))
  return moralisGet(`/discovery/tokens/filtered?${params}`)
}

// ── DEX / Pairs ───────────────────────────────────────────────────────

export async function getPairStats(pairAddress: string, chain = 'eth') {
  return moralisGet(`/pairs/${pairAddress}/stats?chain=${chain}`)
}

export async function getPairCandlesticks(pairAddress: string, chain = 'eth', timeframe = '1h', limit = 60) {
  return moralisGet(`/pairs/${pairAddress}/ohlcv?chain=${chain}&timeframe=${timeframe}&limit=${limit}`)
}

export async function getSnipers(pairAddress: string, chain = 'eth') {
  return moralisGet(`/pairs/${pairAddress}/snipers?chain=${chain}`)
}

export async function getSwapsByPair(pairAddress: string, chain = 'eth', limit = 20) {
  return moralisGet(`/pairs/${pairAddress}/swaps?chain=${chain}&limit=${limit}`)
}

// ── Wallet ────────────────────────────────────────────────────────────

export async function getWalletTokenBalancesPrice(wallet: string, chain = 'eth') {
  return moralisGet(`/${wallet}/erc20?chain=${chain}`)
}

export async function getWalletNetWorth(wallet: string) {
  return moralisGet(`/wallets/${wallet}/net-worth`)
}

export async function getWalletStats(wallet: string, chain = 'eth') {
  return moralisGet(`/wallets/${wallet}/stats?chain=${chain}`)
}

export async function getWalletProfitability(wallet: string, chain = 'eth') {
  return moralisGet(`/wallets/${wallet}/profitability?chain=${chain}`)
}

export async function getWalletInsight(wallet: string, chain = 'eth') {
  return moralisGet(`/wallets/${wallet}/insight?chain=${chain}`)
}

export async function getWalletApprovals(wallet: string, chain = 'eth') {
  return moralisGet(`/${wallet}/erc20/approvals?chain=${chain}`)
}

export async function getWalletActiveChains(wallet: string) {
  return moralisGet(`/${wallet}/chains`)
}

export async function getSwapsByWallet(wallet: string, chain = 'eth', limit = 20) {
  return moralisGet(`/wallets/${wallet}/swaps?chain=${chain}&limit=${limit}`)
}

// ── DeFi ──────────────────────────────────────────────────────────────

export async function getDefiSummary(wallet: string, chain = 'eth') {
  return moralisGet(`/wallets/${wallet}/defi/summary?chain=${chain}`)
}

export async function getDefiPositionsByProtocol(wallet: string, chain = 'eth') {
  return moralisGet(`/wallets/${wallet}/defi/positions?chain=${chain}`)
}

// ── Market Data ───────────────────────────────────────────────────────

export async function getTopByMarketCap(limit = 20) {
  return moralisGet(`/market-data/global/market-cap/top-crypto?limit=${limit}`)
}

export async function getTopByVolume(limit = 20) {
  return moralisGet(`/market-data/global/volume/top-crypto?limit=${limit}`)
}

// ── Contract Security ─────────────────────────────────────────────────

export async function reviewContracts(address: string, chain = 'eth') {
  return moralisGet(`/contracts-review?chain=${chain}&contracts=${address}`)
}

// ── Solana ─────────────────────────────────────────────────────────────

export async function solanaGetTokenPrice(address: string) {
  return moralisGet(`/token/mainnet/${address}/price`, SOL_BASE)
}

export async function solanaGetPortfolio(wallet: string) {
  return moralisGet(`/account/mainnet/${wallet}/portfolio`, SOL_BASE)
}

export async function solanaGetTopHolders(address: string, limit = 10) {
  return moralisGet(`/token/mainnet/${address}/top-holders?limit=${limit}`, SOL_BASE)
}

export async function solanaGetTokenPairs(address: string) {
  return moralisGet(`/token/mainnet/${address}/pairs`, SOL_BASE)
}

export async function solanaGetCandlesticks(pairAddress: string, timeframe = '1h') {
  return moralisGet(`/token/mainnet/pairs/${pairAddress}/ohlcv?timeframe=${timeframe}`, SOL_BASE)
}

export async function solanaGetSnipers(pairAddress: string) {
  return moralisGet(`/token/mainnet/pairs/${pairAddress}/snipers`, SOL_BASE)
}

export async function solanaGetTokenBondingStatus(address: string) {
  return moralisGet(`/token/mainnet/${address}/bonding-status`, SOL_BASE)
}

// ── Availability check ────────────────────────────────────────────────

export function isAvailable(): boolean {
  return !!getApiKey()
}
