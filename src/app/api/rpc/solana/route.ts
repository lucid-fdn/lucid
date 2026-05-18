import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

// Allowed JSON-RPC methods — only what the wallet adapter needs
const ALLOWED_METHODS = new Set([
  'getLatestBlockhash',
  'getBalance',
  'getAccountInfo',
  'getTokenAccountsByOwner',
  'getSignatureStatuses',
  'getTransaction',
  'getRecentBlockhash',
  'getFeeForMessage',
  'getMinimumBalanceForRentExemption',
  'sendTransaction',
  'simulateTransaction',
  'getEpochInfo',
  'getSlot',
  'getBlockHeight',
  'isBlockhashValid',
  'getRecentPrioritizationFees',
])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Support single and batch requests
    const requests = Array.isArray(body) ? body : [body]

    for (const r of requests) {
      if (!r.method || !ALLOWED_METHODS.has(r.method)) {
        return NextResponse.json(
          { error: `Method not allowed: ${r.method}` },
          { status: 403 },
        )
      }
    }

    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: 'RPC proxy error' },
      { status: 502 },
    )
  }
}
