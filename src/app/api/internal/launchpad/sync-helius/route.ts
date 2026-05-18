/**
 * Helius Webhook Batch Sync
 *
 * POST /api/internal/launchpad/sync-helius
 *
 * Ensures all minted token addresses are registered in the Helius webhook.
 * Idempotent — safe to run multiple times. Designed for backfill after
 * adding Helius integration to existing tokens.
 *
 * Auth: CRON_SECRET or X-Admin-Key
 */

import { NextRequest, NextResponse } from 'next/server'
import { addMintToHeliusWebhook } from '@/lib/launchpad/solana-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    ?? req.headers.get('x-admin-key')
  const expected = process.env.CRON_SECRET || process.env.ADMIN_SECRET

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase } = await import('@/lib/db/client')

  // Fetch all agents with a token_mint that are actively trading
  const { data: agents, error } = await supabase
    .from('launched_agents')
    .select('id, slug, token_mint')
    .not('token_mint', 'is', null)
    .in('status', ['trading', 'launching'])

  if (error || !agents) {
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }

  const results: { slug: string; tokenMint: string; synced: boolean }[] = []

  for (const agent of agents) {
    if (!agent.token_mint) continue
    const synced = await addMintToHeliusWebhook(agent.token_mint)
    results.push({
      slug: agent.slug,
      tokenMint: agent.token_mint,
      synced,
    })
  }

  const syncedCount = results.filter((r) => r.synced).length

  return NextResponse.json({
    total: results.length,
    synced: syncedCount,
    skipped: results.length - syncedCount,
    results,
  })
}
