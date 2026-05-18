/**
 * wallet_history — Get transaction history for a wallet address.
 *
 * Providers (via shared/providers.ts registry):
 *   Solana: Helius Enhanced Transaction API (parsed, enriched)
 *   EVM:    QuickNode qn_getTransactionsByAddress (Token & NFT API v2)
 *
 * Supports two modes:
 *   - "history"           → recent transactions (default)
 *   - "first_transaction" → find when wallet was first funded
 */

import type { Chain } from '@lucid-fdn/web3-types'
import { validateAddress } from '../shared/validate.js'
import { getConfig } from '../config.js'
import { helius, warnIfMissing, providerUrl } from '../shared/providers.js'
import { rateLimitedFetch } from '../shared/rate-limit.js'

export interface GetHistoryArgs {
  /** Wallet address (EVM or Solana) */
  address: string
  /** Chain to query */
  chain: 'solana' | Chain
  /** Max transactions to return (default: 10, max: 50) */
  limit?: number
  /** Query mode */
  mode?: 'history' | 'first_transaction'
}

interface TransactionRecord {
  hash: string
  timestamp: string
  type: string
  from: string
  to: string
  amount?: string
  token?: string
  fee?: string
  chain: string
  status: 'success' | 'failed'
}

export async function toolGetWalletHistory(args: GetHistoryArgs): Promise<string> {
  const { address, chain, mode = 'history' } = args
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)

  // Cache check
  const cacheKey = `${mode}:${chain}:${address}:${limit}`
  const cached = getConfig().toolCache.get('wallet_history', cacheKey)
  if (cached) return cached

  // Validate address
  const addrErr = validateAddress(address, chain === 'solana' ? 'solana' : 'evm')
  if (addrErr) return JSON.stringify({ error: addrErr })

  try {
    let transactions: TransactionRecord[]

    if (chain === 'solana') {
      transactions = await getSolanaHistory(address, limit, mode)
    } else {
      transactions = await getEvmHistory(address, chain, limit, mode)
    }

    const result = formatResult(transactions, address, chain, mode)
    const resultStr = JSON.stringify(result)
    getConfig().toolCache.set('wallet_history', cacheKey, resultStr)
    return resultStr
  } catch (err) {
    return JSON.stringify({
      error: `Failed to fetch transaction history: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: chain === 'solana'
        ? 'Ensure HELIUS_API_KEY is set for Solana transaction history'
        : 'Ensure your RPC URL is a QuickNode endpoint with Token & NFT API v2 add-on',
    })
  }
}

// ── Solana (Helius via provider registry) ────────────────────────────

async function getSolanaHistory(
  address: string,
  limit: number,
  mode: string,
): Promise<TransactionRecord[]> {
  const h = helius()
  if (!h.available) {
    warnIfMissing('helius')
    throw new Error('HELIUS_API_KEY not configured — required for Solana transaction history')
  }

  if (mode === 'first_transaction') {
    return getSolanaFirstTransaction(address, h.apiKey!)
  }

  // Enhanced Transaction API — parsed, enriched data in one call
  const url = providerUrl('helius', `/v0/addresses/${address}/transactions?api-key=${h.apiKey}&limit=${limit}`)
  const res = await rateLimitedFetch(url, { signal: AbortSignal.timeout(15000) })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Helius API error ${res.status}: ${body}`)
  }

  const txs = await res.json() as HeliusTransaction[]
  return txs.map(tx => parseHeliusTx(tx))
}

async function getSolanaFirstTransaction(
  address: string,
  apiKey: string,
): Promise<TransactionRecord[]> {
  // Use getSignaturesForAddress RPC via Helius
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
  let before: string | undefined
  let oldest: { signature: string; blockTime: number } | null = null

  // Paginate backwards (max 10 pages to avoid runaway)
  for (let page = 0; page < 10; page++) {
    const params: unknown[] = [
      address,
      { limit: 1000, ...(before ? { before } : {}) },
    ]
    const res = await rateLimitedFetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params,
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json() as { result?: Array<{ signature: string; blockTime: number | null; err: unknown }> }
    const sigs = data.result
    if (!sigs || sigs.length === 0) break

    // Track the oldest in this batch (last element = oldest)
    const last = sigs[sigs.length - 1]
    if (last.blockTime) {
      oldest = { signature: last.signature, blockTime: last.blockTime }
    }

    // If we got fewer than 1000, we've reached the end
    if (sigs.length < 1000) break
    before = last.signature
  }

  if (!oldest) {
    return []
  }

  // Fetch the actual first transaction details via Enhanced API
  const url = providerUrl('helius', `/v0/transactions/?api-key=${helius().apiKey}`)
  const detailRes = await rateLimitedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: [oldest.signature] }),
    signal: AbortSignal.timeout(10000),
  })

  if (detailRes.ok) {
    const details = await detailRes.json() as HeliusTransaction[]
    if (details.length > 0) return [parseHeliusTx(details[0])]
  }

  // Fallback: return minimal info from signatures
  return [{
    hash: oldest.signature,
    timestamp: new Date(oldest.blockTime * 1000).toISOString(),
    type: 'unknown',
    from: 'unknown',
    to: address,
    chain: 'solana',
    status: 'success' as const,
  }]
}

interface HeliusTransaction {
  signature: string
  timestamp: number
  type: string
  description?: string
  fee: number
  feePayer: string
  nativeTransfers?: Array<{
    fromUserAccount: string
    toUserAccount: string
    amount: number
  }>
  tokenTransfers?: Array<{
    fromUserAccount: string
    toUserAccount: string
    tokenAmount: number
    mint: string
    tokenStandard?: string
  }>
  events?: Record<string, unknown>
}

function parseHeliusTx(tx: HeliusTransaction): TransactionRecord {
  // Determine primary transfer
  let from = tx.feePayer
  let to = ''
  let amount: string | undefined
  let token: string | undefined

  if (tx.nativeTransfers?.length) {
    const t = tx.nativeTransfers[0]
    from = t.fromUserAccount
    to = t.toUserAccount
    amount = `${(t.amount / 1e9).toFixed(4)} SOL`
    token = 'SOL'
  } else if (tx.tokenTransfers?.length) {
    const t = tx.tokenTransfers[0]
    from = t.fromUserAccount || tx.feePayer
    to = t.toUserAccount || ''
    amount = String(t.tokenAmount)
    token = t.mint
  }

  return {
    hash: tx.signature,
    timestamp: new Date(tx.timestamp * 1000).toISOString(),
    type: tx.type?.toLowerCase() || 'unknown',
    from,
    to,
    amount,
    token,
    fee: `${(tx.fee / 1e9).toFixed(6)} SOL`,
    chain: 'solana',
    status: 'success',
  }
}

// ── EVM (QuickNode via rpc-fallback) ────────────────────────────────

async function getEvmHistory(
  address: string,
  chain: Chain,
  limit: number,
  mode: string,
): Promise<TransactionRecord[]> {
  const rpcUrl = getConfig().rpcUrlResolver(chain)
  if (!rpcUrl || !rpcUrl.includes('quiknode')) {
    throw new Error(`QuickNode RPC required for ${chain} transaction history. Current RPC does not support qn_getTransactionsByAddress.`)
  }

  // For first_transaction, we need to paginate to find the earliest
  if (mode === 'first_transaction') {
    return getEvmFirstTransaction(address, chain, rpcUrl)
  }

  const perPage = Math.min(limit, 100)
  const res = await rateLimitedFetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'qn_getTransactionsByAddress',
      params: [{ address, page: 1, perPage }],
    }),
    signal: AbortSignal.timeout(15000),
  })

  const data = await res.json() as {
    result?: {
      paginatedItems?: EvmTransaction[]
    }
    error?: { message: string }
  }

  if (data.error) {
    throw new Error(`QuickNode error: ${data.error.message}`)
  }

  const items = data.result?.paginatedItems || []
  return items.slice(0, limit).map(tx => parseEvmTx(tx, chain))
}

async function getEvmFirstTransaction(
  address: string,
  chain: Chain,
  rpcUrl: string,
): Promise<TransactionRecord[]> {
  let oldestTx: EvmTransaction | null = null
  // Paginate through results (max 10 pages)
  for (let page = 1; page <= 10; page++) {
    const res = await rateLimitedFetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'qn_getTransactionsByAddress',
        params: [{ address, page, perPage: 100 }],
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json() as {
      result?: { paginatedItems?: EvmTransaction[] }
    }

    const items = data.result?.paginatedItems
    if (!items || items.length === 0) break

    oldestTx = items[items.length - 1]

    if (items.length < 100) break
  }

  if (!oldestTx) return []
  return [parseEvmTx(oldestTx, chain)]
}

interface EvmTransaction {
  transactionHash: string
  blockTimestamp: string
  blockNumber: string
  fromAddress: string
  toAddress: string
  value: string
  status?: string
  contractAddress?: string
  transactionIndex?: string
}

function parseEvmTx(tx: EvmTransaction, chain: string): TransactionRecord {
  const valueWei = BigInt(tx.value || '0')
  const valueEth = Number(valueWei) / 1e18

  return {
    hash: tx.transactionHash,
    timestamp: tx.blockTimestamp || new Date().toISOString(),
    type: tx.contractAddress ? 'contract_interaction' : (valueWei > 0n ? 'transfer' : 'interaction'),
    from: tx.fromAddress,
    to: tx.toAddress || tx.contractAddress || '',
    amount: valueEth > 0 ? `${valueEth.toFixed(6)} ETH` : undefined,
    token: valueEth > 0 ? 'ETH' : undefined,
    chain,
    status: tx.status === '0x0' ? 'failed' : 'success',
  }
}

// ── Output Formatting ────────────────────────────────────────────────

function formatResult(
  transactions: TransactionRecord[],
  address: string,
  chain: string,
  mode: string,
) {
  if (transactions.length === 0) {
    return {
      address,
      chain,
      mode,
      transactions: [],
      formatted: mode === 'first_transaction'
        ? `No transactions found for ${address} on ${chain}. The wallet may not have been used yet.`
        : `No recent transactions found for ${address} on ${chain}.`,
    }
  }

  if (mode === 'first_transaction') {
    const first = transactions[0]
    return {
      address,
      chain,
      mode,
      firstTransaction: first,
      formatted: `Wallet ${address} on ${chain} was first active on ${first.timestamp} (tx: ${first.hash}). Type: ${first.type}${first.amount ? `, amount: ${first.amount}` : ''}.`,
    }
  }

  const lines = transactions.map((tx, i) =>
    `${i + 1}. ${tx.timestamp} | ${tx.type} | ${tx.amount || 'contract call'} | ${tx.hash.slice(0, 12)}...`
  )

  return {
    address,
    chain,
    mode,
    transactions,
    formatted: `Recent transactions for ${address} on ${chain}:\n${lines.join('\n')}`,
  }
}
