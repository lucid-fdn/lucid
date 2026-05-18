/**
 * Launchpad Global Stats
 *
 * GET /api/launchpad/stats
 *
 * Returns aggregate stats for the stats ticker bar:
 * - Total trading agents
 * - Total volume (sum of all revenue)
 * - Active stakers (sum of all holder counts)
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data: agents, error } = await supabase
      .from('launched_agents')
      .select('total_revenue_usdc, holder_count, total_staked')
      .eq('status', 'trading')

    if (error) throw error

    const rows = agents ?? []
    const totalAgents = rows.length
    const totalVolume = rows.reduce(
      (sum, a) => sum + Number(a.total_revenue_usdc ?? 0),
      0,
    )
    const activeStakers = rows.reduce(
      (sum, a) => sum + Number(a.holder_count ?? 0),
      0,
    )

    return NextResponse.json(
      { totalAgents, totalVolume, activeStakers },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      },
    )
  } catch {
    // Fallback: return zeros so the ticker doesn't break
    return NextResponse.json({ totalAgents: 0, totalVolume: 0, activeStakers: 0 })
  }
}
