import { NextResponse } from 'next/server'
import { proxyToOracle } from '@/lib/oracle/proxy'

export const dynamic = 'force-dynamic'

/**
 * Proxy route for Oracle economy snapshot.
 * GET /api/oracle/economy -> Oracle API /v1/oracle/economy/current
 * Returns empty object on error for graceful fallback.
 */
export async function GET() {
  const path = '/v1/oracle/economy/current'
  try {
    const res = await proxyToOracle(path, 30)

    if (!res.ok) {
      return NextResponse.json({})
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[oracle-proxy]', path, (err as Error).message)
    return NextResponse.json({})
  }
}
