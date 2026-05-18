/**
 * Agent Price Chart Data
 *
 * GET /api/launchpad/agents/[slug]/chart?range=1D
 *
 * Returns OHLCV candlestick data for the agent token.
 * 4-tier data source fallback:
 *   1. Birdeye OHLCV (real on-chain candles, requires API key)
 *   2. Jupiter price history (real price snapshots → synthetic candles)
 *   3. Jupiter current price + mock candles
 *   4. Pure mock candles from agent stats
 */

import { NextResponse } from 'next/server'
import { getLaunchedAgentBySlug } from '@/lib/db/launchpad'

export const dynamic = 'force-dynamic'

type TimeRange = '1H' | '4H' | '1D' | '1W' | '1M' | 'ALL'

const RANGE_CONFIG: Record<TimeRange, { intervalMs: number; count: number }> = {
  '1H': { intervalMs: 60_000, count: 60 },
  '4H': { intervalMs: 5 * 60_000, count: 48 },
  '1D': { intervalMs: 30 * 60_000, count: 48 },
  '1W': { intervalMs: 4 * 3600_000, count: 42 },
  '1M': { intervalMs: 24 * 3600_000, count: 30 },
  'ALL': { intervalMs: 24 * 3600_000, count: 90 },
}

// ---------------------------------------------------------------------------
// Jupiter: fetch real price by mint address
// ---------------------------------------------------------------------------

async function fetchJupiterPriceByMint(tokenMint: string): Promise<number | null> {
  try {
    const headers: Record<string, string> = {}
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY
    const res = await fetch(
      `https://api.jup.ag/price/v3?ids=${tokenMint}`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data[tokenMint]?.usdPrice ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Birdeye: fetch real OHLCV data for Solana tokens
// ---------------------------------------------------------------------------

interface BirdeyeCandle {
  unixTime: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

async function fetchBirdeyeOHLCV(
  tokenMint: string,
  range: TimeRange,
): Promise<BirdeyeCandle[] | null> {
  const apiKey = process.env.BIRDEYE_API_KEY
  if (!apiKey) return null

  // Map our ranges to Birdeye time_from/time_to + type
  const now = Math.floor(Date.now() / 1000)
  const rangeMap: Record<TimeRange, { type: string; timeFrom: number }> = {
    '1H': { type: '1m', timeFrom: now - 3600 },
    '4H': { type: '5m', timeFrom: now - 4 * 3600 },
    '1D': { type: '30m', timeFrom: now - 86400 },
    '1W': { type: '4H', timeFrom: now - 7 * 86400 },
    '1M': { type: '1D', timeFrom: now - 30 * 86400 },
    'ALL': { type: '1D', timeFrom: now - 90 * 86400 },
  }

  const { type, timeFrom } = rangeMap[range]

  try {
    const res = await fetch(
      `https://public-api.birdeye.so/defi/ohlcv?address=${tokenMint}&type=${type}&time_from=${timeFrom}&time_to=${now}`,
      {
        headers: { 'X-API-KEY': apiKey },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.data?.items ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Jupiter: fetch historical price snapshots and convert to candles
// ---------------------------------------------------------------------------

interface JupiterPricePoint {
  unixTime: number
  value: number
}

const RANGE_TO_JUPITER: Record<TimeRange, { intervalSecs: string; lookback: number }> = {
  '1H': { intervalSecs: '60', lookback: 3600 },
  '4H': { intervalSecs: '300', lookback: 4 * 3600 },
  '1D': { intervalSecs: '1800', lookback: 86400 },
  '1W': { intervalSecs: '14400', lookback: 7 * 86400 },
  '1M': { intervalSecs: '86400', lookback: 30 * 86400 },
  'ALL': { intervalSecs: '86400', lookback: 90 * 86400 },
}

async function fetchJupiterPriceHistory(
  tokenMint: string,
  range: TimeRange,
): Promise<JupiterPricePoint[] | null> {
  const config = RANGE_TO_JUPITER[range]
  const now = Math.floor(Date.now() / 1000)
  const from = now - config.lookback

  try {
    const headers: Record<string, string> = {}
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY
    const res = await fetch(
      `https://api.jup.ag/price/v3/history?id=${tokenMint}&start=${from}&end=${now}&interval=${config.intervalSecs}`,
      { signal: AbortSignal.timeout(8000), headers }
    )
    if (!res.ok) return null
    const data = await res.json()
    const prices: JupiterPricePoint[] = data.data?.prices ?? data.prices ?? null
    if (!prices || prices.length < 2) return null
    return prices
  } catch {
    return null
  }
}

/** Convert Jupiter price snapshots to OHLCV candles */
function pricePointsToCandles(
  points: JupiterPricePoint[],
  range: TimeRange,
) {
  const config = RANGE_CONFIG[range]
  const bucketMs = config.intervalMs
  const buckets = new Map<number, number[]>()

  for (const pt of points) {
    const bucketKey = Math.floor((pt.unixTime * 1000) / bucketMs) * bucketMs
    const arr = buckets.get(bucketKey)
    if (arr) arr.push(pt.value)
    else buckets.set(bucketKey, [pt.value])
  }

  const candles = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, prices]) => {
      const open = prices[0]
      const close = prices[prices.length - 1]
      const high = Math.max(...prices)
      const low = Math.min(...prices)
      return {
        time: new Date(ts).toISOString(),
        open: Number(open.toFixed(6)),
        high: Number(high.toFixed(6)),
        low: Number(low.toFixed(6)),
        close: Number(close.toFixed(6)),
        volume: 0,
      }
    })

  return candles.length >= 2 ? candles : null
}

// ---------------------------------------------------------------------------
// Mock candle generation (fallback)
// ---------------------------------------------------------------------------

function generateCandles(
  basePrice: number,
  launchedAt: string | null,
  range: TimeRange,
  totalRevenue: number,
  totalRequests: number,
) {
  const config = RANGE_CONFIG[range]
  const now = Date.now()
  const launchTime = launchedAt ? new Date(launchedAt).getTime() : now - 30 * 86400_000

  let seed = totalRequests * 17 + Math.floor(totalRevenue * 31) + config.count
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const timeSinceLaunch = now - launchTime
  const maxCandles = Math.min(config.count, Math.floor(timeSinceLaunch / config.intervalMs))
  const candleCount = Math.max(10, maxCandles)

  const startTime = now - candleCount * config.intervalMs
  const candles = []

  const startPrice = basePrice * (0.3 + rand() * 0.4)
  let price = startPrice
  const trendPerCandle = (basePrice - startPrice) / candleCount

  for (let i = 0; i < candleCount; i++) {
    const time = new Date(startTime + i * config.intervalMs).toISOString()

    const volatility = range === '1H' || range === '4H' ? 0.015 : 0.03
    const change = (rand() - 0.45) * volatility * price + trendPerCandle

    const open = price
    price = Math.max(0.0001, price + change)
    const close = price

    const wickFactor = 1 + rand() * volatility * 0.5
    const high = Math.max(open, close) * wickFactor
    const low = Math.min(open, close) / wickFactor

    const baseVolume = totalRevenue > 0 ? totalRevenue / candleCount * 3 : 1000
    const volume = baseVolume * (0.5 + rand() * 2) * (1 + Math.abs(change / price) * 10)

    candles.push({
      time,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: Number(volume.toFixed(2)),
    })
  }

  return candles
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(req.url)
  const range = (searchParams.get('range') || '1D') as TimeRange

  if (!RANGE_CONFIG[range]) {
    return NextResponse.json({ error: 'Invalid range' }, { status: 400 })
  }

  const agent = await getLaunchedAgentBySlug(slug)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Strategy 1: Try Birdeye OHLCV (real on-chain data) if token is minted
  if (agent.token_mint) {
    const birdeyeCandles = await fetchBirdeyeOHLCV(agent.token_mint, range)
    if (birdeyeCandles && birdeyeCandles.length > 0) {
      const candles = birdeyeCandles.map((c) => ({
        time: new Date(c.unixTime * 1000).toISOString(),
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
        volume: c.v,
      }))
      return NextResponse.json(
        { candles, source: 'birdeye' },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
      )
    }
  }

  // Strategy 2: Try Jupiter price history (real historical snapshots)
  if (agent.token_mint) {
    const pricePoints = await fetchJupiterPriceHistory(agent.token_mint, range)
    if (pricePoints) {
      const candles = pricePointsToCandles(pricePoints, range)
      if (candles) {
        return NextResponse.json(
          { candles, source: 'jupiter-history' },
          { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
        )
      }
    }
  }

  // Strategy 3: Try Jupiter for current price, generate candles around it
  let basePrice = Number(agent.price_per_request)
  if (agent.token_mint) {
    const jupiterPrice = await fetchJupiterPriceByMint(agent.token_mint)
    if (jupiterPrice && jupiterPrice > 0) {
      basePrice = jupiterPrice
    }
  }

  // Strategy 4: Fallback to mock candle generation
  const candles = generateCandles(
    basePrice,
    agent.launched_at,
    range,
    Number(agent.total_revenue_usdc),
    agent.total_requests,
  )

  return NextResponse.json(
    { candles, source: agent.token_mint ? 'jupiter+mock' : 'mock' },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
  )
}
