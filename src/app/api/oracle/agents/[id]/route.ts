import { NextRequest, NextResponse } from 'next/server'
import { proxyToOracle } from '@/lib/oracle/proxy'

export const dynamic = 'force-dynamic'

/**
 * Proxy route for enriched agent detail.
 * GET /api/oracle/agents/:id -> Oracle API /v1/oracle/agents/:id
 * Returns full enriched agent data with wallets, protocols, reputation, transactions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const path = `/v1/oracle/agents/${encodeURIComponent(id)}`

  try {
    const res = await proxyToOracle(path, 30)

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[oracle-proxy]', path, (err as Error).message)
    return NextResponse.json(
      { error: 'Failed to fetch agent' },
      { status: 500 }
    )
  }
}
