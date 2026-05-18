import { NextRequest, NextResponse } from 'next/server'
import { proxyToOracle } from '@/lib/oracle/proxy'

export const dynamic = 'force-dynamic'

/**
 * Proxy route for Oracle agent search.
 * Passes offset as cursor to the Oracle API, returns in the format
 * expected by useInfiniteScroll: { items, nextCursor, total }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)
  const q = searchParams.get('q') ?? '*'
  const sort = searchParams.get('sort') ?? 'newest'
  const chain = searchParams.get('chain') ?? null
  // The useInfiniteScroll hook sends the cursor as 'offset' param
  const cursor = searchParams.get('cursor') ?? searchParams.get('offset') ?? null

  const path = `/v1/oracle/agents/search`
  try {
    const url = new URL(path, 'http://placeholder')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('sort', sort)
    if (chain) url.searchParams.set('chain', chain)
    if (cursor) url.searchParams.set('cursor', cursor)

    const fullPath = `${url.pathname}${url.search}`
    const res = await proxyToOracle(fullPath, 15)

    if (!res.ok) {
      return NextResponse.json({ items: [], nextCursor: null, total: 0 })
    }

    const data = await res.json()
    // Map API field names to dashboard expected names
    const items = (data.data ?? []).map((a: any) => ({
      ...a,
      portfolio_value_usd: a.tvl ?? a.portfolio_value_usd ?? 0,
      tx_count_24h: a.tx_count ?? a.tx_count_24h ?? 0,
    }))

    const hasMore = data.pagination?.has_more ?? false
    return NextResponse.json({
      items,
      nextCursor: hasMore ? (data.pagination?.next_cursor ?? String(items.length)) : null,
      total: hasMore ? items.length + 1 : items.length,
    })
  } catch (err) {
    console.error('[oracle-proxy]', path, (err as Error).message)
    return NextResponse.json({ items: [], nextCursor: null, total: 0 })
  }
}
