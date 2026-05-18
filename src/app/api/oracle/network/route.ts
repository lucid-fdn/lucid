import { NextRequest, NextResponse } from 'next/server'
import { proxyToOracle } from '@/lib/oracle/proxy'

export const dynamic = 'force-dynamic'

/**
 * Proxy route for agent network graph.
 *
 * GET /api/oracle/network -> Oracle API GET /v1/oracle/agents/graph?limit=500
 *
 * The Oracle API now returns a pre-computed GraphSnapshot format:
 *   { data: { nodes, links, meta } }
 *
 * This route unwraps the `data` envelope and returns the snapshot directly.
 * Falls back to empty graph on error.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const limit = Math.min(Number(searchParams.get('limit') ?? 500), 2000)

  const path = `/v1/oracle/agents/graph?limit=${limit}`
  try {
    const res = await proxyToOracle(path, 60)

    if (!res.ok) {
      return NextResponse.json({
        nodes: [],
        links: [],
        meta: { totalAgents: 0, totalConnections: 0, chainCounts: {}, computedAt: '' },
      })
    }

    const json = await res.json()
    const snapshot = json.data ?? json

    // Ensure the response has the expected shape
    const nodes = snapshot.nodes ?? []
    const links = snapshot.links ?? []
    const meta = snapshot.meta ?? {
      totalAgents: nodes.length,
      totalConnections: links.length,
      chainCounts: {} as Record<string, number>,
      computedAt: new Date().toISOString(),
    }

    // Compute chainCounts if not present (backward compat with old edge format)
    if (Object.keys(meta.chainCounts).length === 0 && nodes.length > 0) {
      for (const n of nodes) {
        const chain = n.chain ?? 'base'
        meta.chainCounts[chain] = (meta.chainCounts[chain] ?? 0) + 1
      }
    }

    return NextResponse.json({ nodes, links, meta })
  } catch (err) {
    console.error('[oracle-proxy]', path, (err as Error).message)
    return NextResponse.json({
      nodes: [],
      links: [],
      meta: { totalAgents: 0, totalConnections: 0, chainCounts: {}, computedAt: '' },
    })
  }
}
