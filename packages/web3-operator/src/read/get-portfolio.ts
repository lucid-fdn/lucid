/**
 * get_portfolio — Get full portfolio state with USD values.
 *
 * Combines wallet balances with real-time prices to produce
 * a complete portfolio view with USD valuations.
 *
 * EVM balance sources (in priority order):
 *   1. QuickNode Token API (qn_getWalletTokenBalance) — single call, all tokens + metadata
 *   2. Direct RPC balanceOf (GOAT SDK core pattern) — fallback, well-known tokens only
 *
 * This is the foundation for PnL tracking and risk assessment.
 */

import type { Chain, PortfolioState, TokenBalance } from '@lucid-fdn/web3-types'
import { batchJupiterPrices } from './get-price.js'
import { validateAddress } from '../shared/validate.js'
import { rateLimitedFetch } from '../shared/rate-limit.js'
import { EVM_CHAIN_IDS } from '../shared/token-constants.js'
import { providerUrl } from '../shared/providers.js'
import { getConfig } from '../config.js'

export interface GetPortfolioArgs {
  /** Wallet address (EVM or Solana) */
  address: string
  /** Chain to query. Use "all" for full portfolio. */
  chain: Chain | 'all'
  /** Optional Solana address (when chain="all" and primary address is EVM) */
  solanaAddress?: string
}

/**
 * Get portfolio state with USD valuations.
 * Returns structured data for both the agent and the Reason lane.
 */
export async function toolGetPortfolio(args: GetPortfolioArgs): Promise<string> {
  const { address, chain, solanaAddress } = args

  // Check tool cache first
  const cacheKey = `${address}:${chain}`
  const cached = getConfig().toolCache.get('get_portfolio', cacheKey)
  if (cached) return cached

  // Validate address format
  if (chain === 'solana' || chain === 'all') {
    const solAddr = chain === 'solana' ? address : (solanaAddress || address)
    if (solAddr && !solAddr.startsWith('0x')) {
      const err = validateAddress(solAddr, 'solana')
      if (err) return JSON.stringify({ error: err })
    }
  }
  if (chain !== 'solana') {
    const err = validateAddress(address, 'ethereum')
    if (err && chain !== 'all') return JSON.stringify({ error: err })
  }

  const balances: TokenBalance[] = []
  let totalValueUsd = 0
  const warnings: string[] = []

  // Run Solana + EVM chains in parallel
  const fetchSolana = (chain === 'all' || chain === 'solana')
    ? getSolanaBalancesWithPrices(chain === 'solana' ? address : (solanaAddress || address))
    : Promise.resolve([])

  const evmChains: Chain[] = (chain === 'all')
    ? ['ethereum', 'base', 'polygon', 'arbitrum']
    : (chain !== 'solana' ? [chain] : [])

  const fetchEvm = evmChains.length > 0
    ? Promise.allSettled(evmChains.map(c => getEvmBalancesWithPrices(c, address)))
    : Promise.resolve([])

  const [solBalances, evmResults] = await Promise.all([fetchSolana, fetchEvm])

  balances.push(...solBalances)
  for (let i = 0; i < evmResults.length; i++) {
    const result = evmResults[i] as PromiseSettledResult<TokenBalance[]>
    if (result.status === 'fulfilled') {
      balances.push(...result.value)
    } else {
      warnings.push(`${evmChains[i]}: failed to fetch balances`)
    }
  }

  // Calculate total
  for (const b of balances) {
    if (b.valueUsd) totalValueUsd += b.valueUsd
  }

  const state: PortfolioState = {
    wallet: address,
    chain,
    balances: balances.filter(b => parseFloat(b.balance) > 0),
    totalValueUsd,
    timestamp: new Date().toISOString(),
  }

  // Format human-readable output
  const lines: string[] = [`Portfolio: ${address.slice(0, 6)}...${address.slice(-4)}`]
  lines.push(`Total Value: $${totalValueUsd.toFixed(2)}`)
  lines.push('')

  // Sort by USD value descending
  const sorted = [...state.balances].sort(
    (a, b) => (b.valueUsd || 0) - (a.valueUsd || 0),
  )

  for (const b of sorted) {
    const pct = totalValueUsd > 0 ? ((b.valueUsd || 0) / totalValueUsd * 100).toFixed(1) : '?'
    const valueStr = b.valueUsd ? `$${b.valueUsd.toFixed(2)}` : '?'
    lines.push(`${b.asset.symbol} (${b.asset.chain}): ${b.balance} — ${valueStr} (${pct}%)`)
  }

  if (warnings.length > 0) {
    lines.push('')
    lines.push(`Warnings: ${warnings.join(', ')}`)
  }

  const result = JSON.stringify({
    portfolio: state,
    ...(warnings.length > 0 && { warnings }),
    formatted: lines.join('\n'),
  })

  // Cache successful result (only if no errors in the response)
  if (balances.length > 0 || warnings.length === 0) {
    getConfig().toolCache.set('get_portfolio', cacheKey, result)
  }

  return result
}

// ── Solana Balances + Prices ─────────────────────────────────────────

function getSolanaRpc(): string {
  return getConfig().rpcUrlResolver('solana') || 'https://api.mainnet-beta.solana.com'
}

async function getSolanaBalancesWithPrices(address: string): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = []

  try {
    // Parallel: SOL balance + token accounts
    const [solBalance, tokenAccounts] = await Promise.all([
      fetchSolBalance(address),
      fetchSolTokenAccounts(address),
    ])

    // Collect all mint addresses for batch price lookup
    const mintAddresses: string[] = ['So11111111111111111111111111111111111111112']
    const tokenEntries: Array<{ mint: string; balance: string; decimals: number }> = []

    if (solBalance > 0) {
      tokenEntries.push({
        mint: 'So11111111111111111111111111111111111111112',
        balance: (solBalance / 1e9).toString(),
        decimals: 9,
      })
    }

    if (tokenAccounts) {
      for (const account of tokenAccounts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = (account as any).account?.data?.parsed?.info
        if (!info) continue
        const amount = info.tokenAmount
        if (!amount || amount.uiAmount === 0) continue

        mintAddresses.push(info.mint)
        tokenEntries.push({
          mint: info.mint,
          balance: amount.uiAmountString || amount.uiAmount.toString(),
          decimals: amount.decimals,
        })
      }
    }

    // Batch price lookup via Jupiter
    const prices = await batchJupiterPrices(mintAddresses)

    for (const entry of tokenEntries) {
      const price = prices.get(entry.mint)
      const balanceNum = parseFloat(entry.balance)
      const valueUsd = price ? balanceNum * price : null

      balances.push({
        asset: {
          symbol: entry.mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : entry.mint.slice(0, 6),
          address: entry.mint,
          chain: 'solana',
          decimals: entry.decimals,
        },
        balance: entry.balance,
        valueUsd,
      })
    }
  } catch {
    // Non-fatal — return whatever we got
  }

  return balances
}

async function fetchSolBalance(address: string): Promise<number> {
  try {
    const res = await fetch(getSolanaRpc(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getBalance',
        params: [address],
      }),
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json() as { result?: { value: number } }
    return data.result?.value || 0
  } catch {
    return 0
  }
}

async function fetchSolTokenAccounts(address: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(getSolanaRpc(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          address,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as { result?: { value: any[] } }
    return data.result?.value || null
  } catch {
    return null
  }
}

// ── EVM Balances ────────────────────────────────────────────────────
// Primary: QuickNode Token API (qn_getWalletTokenBalance) — single call, all tokens + metadata
// Fallback: Direct RPC balanceOf (GOAT SDK core pattern, well-known tokens only)

// RPC URLs from injected config (centralized via initWeb3Operator)
function getChainRpcUrl(chain: Chain): string | null {
  return getConfig().rpcUrlResolver(chain) || null
}

// QuickNode detection: primary RPC URL (before public fallbacks) for QuickNode-specific APIs
function getQuickNodeRpcUrl(chain: Chain): string | undefined {
  const url = getChainRpcUrl(chain)
  return url && url.includes('quiknode') ? url : undefined
}

const NATIVE_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  ethereum: { symbol: 'ETH', decimals: 18 },
  base: { symbol: 'ETH', decimals: 18 },
  polygon: { symbol: 'POL', decimals: 18 },
  arbitrum: { symbol: 'ETH', decimals: 18 },
}

// Map native to wrapped for price lookup
const NATIVE_WRAPPED_MAP: Record<string, string> = {
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  base: '0x4200000000000000000000000000000000000006',
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
}

async function getEvmBalancesWithPrices(chain: Chain, address: string): Promise<TokenBalance[]> {
  const qnRpc = getQuickNodeRpcUrl(chain)
  if (qnRpc) {
    try {
      const result = await getEvmBalancesQuickNode(chain, address, qnRpc)
      if (result.length > 0) return result
    } catch { /* fall through to direct RPC */ }
  }
  return getEvmBalancesRpc(chain, address)
}

// ── QuickNode Token API (primary) ───────────────────────────────────
// qn_getWalletTokenBalance: single call returns ALL ERC-20 balances
// with symbol, decimals, name — no separate metadata lookup needed.
// Available on QuickNode Growth+ plans (Token & NFT API v2 add-on).

async function getEvmBalancesQuickNode(chain: Chain, address: string, rpcUrl: string): Promise<TokenBalance[]> {
  const native = NATIVE_TOKENS[chain]
  const nonZero: Array<{ symbol: string; address: string; decimals: number; balance: number }> = []

  // Parallel: native balance + QuickNode token balances
  const [nativeRes, tokenRes] = await Promise.all([
    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
      signal: AbortSignal.timeout(5000),
    }).then(r => r.json()).catch(() => null),

    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'qn_getWalletTokenBalance',
        params: [{ wallet: address }],
      }),
      signal: AbortSignal.timeout(10000),
    }).then(r => r.json()).catch(() => null),
  ])

  // Native balance
  if (nativeRes && native) {
    const rawHex = (nativeRes as { result?: string }).result || '0x0'
    const rawBi = BigInt(rawHex)
    if (rawBi > 0n) {
      nonZero.push({
        symbol: native.symbol,
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        decimals: native.decimals,
        balance: Number(rawBi) / (10 ** native.decimals),
      })
    }
  }

  // QuickNode token balances — returns { result: { assets: [...] } }
  type QNTokenResult = {
    result?: {
      assets?: Array<{
        address: string
        symbol?: string
        name?: string
        decimals?: number
        amount: string     // human-readable balance
        totalBalance?: string // raw balance
      }>
    }
  }
  const assets = (tokenRes as QNTokenResult)?.result?.assets
  if (assets) {
    for (const asset of assets) {
      const bal = parseFloat(asset.amount)
      if (!bal || bal <= 0) continue

      nonZero.push({
        symbol: asset.symbol || asset.address.slice(0, 6),
        address: asset.address,
        decimals: asset.decimals ?? 18,
        balance: bal,
      })
    }
  }

  if (nonZero.length === 0) return []
  return buildBalancesWithPrices(chain, nonZero)
}

// ── Direct RPC balanceOf (fallback, mirrors GOAT SDK core) ──────────

// Well-known tokens per chain
const EVM_TOKENS_BY_CHAIN: Record<string, Array<{ address: string; symbol: string; decimals: number }>> = {
  ethereum: [
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
  ],
  base: [
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', decimals: 6 },
  ],
  polygon: [
    { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC', decimals: 18 },
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
  ],
  arbitrum: [
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', decimals: 18 },
  ],
}

const BALANCE_OF_SELECTOR = '0x70a08231'

async function getEvmBalancesRpc(chain: Chain, address: string): Promise<TokenBalance[]> {
  const rpc = getChainRpcUrl(chain)
  if (!rpc) return []

  const native = NATIVE_TOKENS[chain]
  const tokens = EVM_TOKENS_BY_CHAIN[chain] || []
  const nonZero: Array<{ symbol: string; address: string; decimals: number; balance: number }> = []

  try {
    const paddedAddr = address.toLowerCase().replace('0x', '').padStart(64, '0')

    const tasks = [
      fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getBalance',
          params: [address, 'latest'],
        }),
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json()).then((d: unknown) => ({
        type: 'native' as const,
        raw: (d as { result?: string }).result || '0x0',
      })).catch(() => ({ type: 'native' as const, raw: '0x0' })),

      ...tokens.map(token =>
        fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'eth_call',
            params: [
              { to: token.address, data: `${BALANCE_OF_SELECTOR}${paddedAddr}` },
              'latest',
            ],
          }),
          signal: AbortSignal.timeout(5000),
        }).then(r => r.json()).then((d: unknown) => ({
          type: 'erc20' as const,
          token,
          raw: (d as { result?: string }).result || '0x0',
        })).catch(() => ({ type: 'erc20' as const, token, raw: '0x0' })),
      ),
    ]

    const results = await Promise.all(tasks)

    for (const result of results) {
      const rawBi = BigInt(result.raw)
      if (rawBi === 0n) continue

      if (result.type === 'native' && native) {
        nonZero.push({ symbol: native.symbol, address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: native.decimals, balance: Number(rawBi) / (10 ** native.decimals) })
      } else if (result.type === 'erc20' && result.token) {
        nonZero.push({ symbol: result.token.symbol, address: result.token.address, decimals: result.token.decimals, balance: Number(rawBi) / (10 ** result.token.decimals) })
      }
    }
  } catch {
    return []
  }

  if (nonZero.length === 0) return []
  return buildBalancesWithPrices(chain, nonZero)
}

// ── Shared: price lookup + balance assembly ─────────────────────────

async function buildBalancesWithPrices(
  chain: Chain,
  nonZero: Array<{ symbol: string; address: string; decimals: number; balance: number }>,
): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = []
  const priceMap = new Map<string, number>()

  const priceAddresses = nonZero.map(t =>
    t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      ? NATIVE_WRAPPED_MAP[chain] || t.address
      : t.address,
  ).filter((v, i, a) => a.indexOf(v) === i)

  const priceTasks = priceAddresses.map(async (addr) => {
    try {
      const dexRes = await rateLimitedFetch(
        providerUrl('dexscreener', `/latest/dex/tokens/${addr}`),
        { signal: AbortSignal.timeout(5000) },
      )
      if (!dexRes.ok) return
      const body = await dexRes.json() as { pairs?: Array<{ chainId: string; priceUsd?: string }> }
      const pair = body.pairs?.find(p => p.chainId === chain) || body.pairs?.[0]
      if (pair?.priceUsd) {
        priceMap.set(addr.toLowerCase(), parseFloat(pair.priceUsd))
      }
    } catch { /* non-fatal */ }
  })

  await Promise.all(priceTasks)

  for (const token of nonZero) {
    const lookupAddr = token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      ? (NATIVE_WRAPPED_MAP[chain] || token.address)
      : token.address
    const price = priceMap.get(lookupAddr.toLowerCase()) ?? null
    const valueUsd = price ? token.balance * price : null

    if (valueUsd !== null && valueUsd < 0.01) continue

    balances.push({
      asset: {
        symbol: token.symbol,
        address: token.address,
        chain,
        decimals: token.decimals,
      },
      balance: token.balance.toString(),
      valueUsd,
    })
  }

  return balances
}
