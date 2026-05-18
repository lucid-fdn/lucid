/**
 * Helius API client — internal data provider for web3-operator tools.
 *
 * NOT exposed as a plugin. Used inside wallet_history, wallet_balance, etc.
 * Falls back gracefully if HELIUS_API_KEY is not set.
 */

function getApiKey(): string | null {
  return process.env.HELIUS_API_KEY || null
}

function getBaseUrl(): string {
  const key = getApiKey()
  return `https://mainnet.helius-rpc.com/?api-key=${key}`
}

async function heliusGet<T = unknown>(path: string): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('HELIUS_API_KEY not set')

  const res = await fetch(`https://api.helius.xyz/v0${path}?api-key=${apiKey}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Helius ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

async function heliusPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('HELIUS_API_KEY not set')

  const res = await fetch(`https://api.helius.xyz/v0${path}?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Helius ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ── DAS API ───────────────────────────────────────────────────────────

export async function getAssetsByOwner(wallet: string) {
  return heliusPost('/rpc', {
    jsonrpc: '2.0', id: 1, method: 'getAssetsByOwner',
    params: { ownerAddress: wallet, page: 1, limit: 100 },
  })
}

export async function searchAssets(query: Record<string, unknown>) {
  return heliusPost('/rpc', {
    jsonrpc: '2.0', id: 1, method: 'searchAssets',
    params: { ...query, page: 1, limit: 20 },
  })
}

// ── Wallet ────────────────────────────────────────────────────────────

export async function getWalletBalances(wallet: string) {
  return heliusGet(`/addresses/${wallet}/balances`)
}

export async function getWalletHistory(wallet: string, type?: string) {
  const typeParam = type ? `&type=${type}` : ''
  return heliusGet(`/addresses/${wallet}/transactions${typeParam}`)
}

export async function getWalletTransfers(wallet: string) {
  return heliusGet(`/addresses/${wallet}/transfers`)
}

export async function getWalletFundedBy(wallet: string) {
  return heliusGet(`/addresses/${wallet}/funded-by`)
}

export async function getWalletIdentity(wallet: string) {
  return heliusGet(`/addresses/${wallet}/identity`)
}

// ── Transactions ──────────────────────────────────────────────────────

export async function parseTransactions(signatures: string[]) {
  return heliusPost('/transactions', { transactions: signatures })
}

// ── Token ─────────────────────────────────────────────────────────────

export async function getTokenHolders(mint: string) {
  return heliusGet(`/token-accounts?mint=${mint}&limit=20`)
}

// ── Priority Fees ─────────────────────────────────────────────────────

export async function getPriorityFeeEstimate(accounts: string[]) {
  return heliusPost('/rpc', {
    jsonrpc: '2.0', id: 1, method: 'getPriorityFeeEstimate',
    params: [{ accountKeys: accounts, options: { recommended: true } }],
  })
}

// ── Availability ──────────────────────────────────────────────────────

export function isAvailable(): boolean {
  return !!getApiKey()
}
