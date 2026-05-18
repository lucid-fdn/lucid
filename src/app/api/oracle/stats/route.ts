import { NextResponse } from 'next/server'
import { proxyToOracle } from '@/lib/oracle/proxy'

export const dynamic = 'force-dynamic'

export async function GET() {
  const path = '/v1/oracle/agents/stats'
  try {
    const res = await proxyToOracle(path, 30)
    if (!res.ok) return NextResponse.json({})
    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('[oracle-proxy]', path, (err as Error).message)
    return NextResponse.json({})
  }
}
