/**
 * Weekly Epoch Cron Trigger
 *
 * POST /api/internal/launchpad/epoch-cron?secret=<CRON_SECRET>
 *
 * Triggered by Vercel Cron or external scheduler once per week.
 * For each trading agent:
 *   1. Gets unassigned usage from agent_usage_ledger
 *   2. Creates a new epoch with revenue breakdown
 *   3. Assigns usage rows to the epoch
 *   4. Creates + funds Streamflow reward pool on-chain (if configured)
 *
 * Cron schedule (vercel.json): every Monday at 00:00 UTC
 */

import { NextResponse } from 'next/server'
import {
  getLaunchedAgents,
  getLatestEpoch,
  getUnassignedUsage,
  createEpoch,
  assignUsageToEpoch,
  getStakingPool,
  updateEpochStatus,
} from '@/lib/db/launchpad'
import { calculateRevenueSplit } from '@/lib/launchpad/pricing'
import { isConfigured } from '@/lib/launchpad/solana-service'
import { createRewardPoolForEpoch, fundRewardPool } from '@/lib/launchpad/streamflow'

export const dynamic = 'force-dynamic'

interface EpochResult {
  slug: string
  epochNumber: number
  usageCount: number
  grossUsdc?: number
  stakerRewardUsdc?: number
  rewardPoolId?: string
  error?: string
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  const expected = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const agents = await getLaunchedAgents({ status: 'trading', limit: 200 })
    const results: EpochResult[] = []

    const now = new Date()
    const periodEnd = now.toISOString()
    const periodStart = new Date(now.getTime() - 7 * 86400_000).toISOString()

    const solanaReady = isConfigured()

    for (const agent of agents) {
      try {
        // 1. Get unassigned usage
        const usage = await getUnassignedUsage(agent.id)
        if (usage.length === 0) {
          results.push({ slug: agent.slug, epochNumber: 0, usageCount: 0 })
          continue
        }

        // 2. Calculate revenue breakdown using centralized pricing
        const grossRevenue = usage.reduce((sum, u) => sum + Number(u.amount_usdc), 0)
        const totalTokens = usage.reduce((sum, u) => sum + (u.tokens_used ?? 0), 0)
        const split = calculateRevenueSplit(
          grossRevenue,
          agent.platform_fee_bps || 1500,
          totalTokens,
        )

        // 3. Get next epoch number
        const latestEpoch = await getLatestEpoch(agent.id)
        const nextEpochNumber = (latestEpoch?.epoch_number ?? 0) + 1

        // 4. Create epoch record
        const epoch = await createEpoch({
          launched_agent_id: agent.id,
          epoch_number: nextEpochNumber,
          period_start: periodStart,
          period_end: periodEnd,
          gross_revenue_usdc: split.grossUsdc,
          platform_fee_usdc: split.platformFeeUsdc,
          staker_reward_usdc: split.stakerRewardUsdc,
          inference_cost_usdc: split.inferenceCostUsdc,
          request_count: usage.length,
        })

        if (!epoch) {
          results.push({
            slug: agent.slug,
            epochNumber: nextEpochNumber,
            usageCount: usage.length,
            error: 'Failed to create epoch',
          })
          continue
        }

        // 5. Assign only the usage rows included in the revenue calculation
        const usageIds = usage.map((u) => u.id)
        const assigned = await assignUsageToEpoch(agent.id, nextEpochNumber, usageIds)

        const result: EpochResult = {
          slug: agent.slug,
          epochNumber: nextEpochNumber,
          usageCount: assigned,
          grossUsdc: split.grossUsdc,
          stakerRewardUsdc: split.stakerRewardUsdc,
        }

        // 6. Fund Streamflow reward pool on-chain (if configured + has staking pool + rewards > 0)
        if (solanaReady && split.stakerRewardUsdc > 0 && agent.token_mint) {
          const pool = await getStakingPool(agent.id)
          if (pool) {
            try {
              // Create reward pool for this epoch
              const rewardResult = await createRewardPoolForEpoch({
                stakePool: pool.streamflow_pool_id,
                stakePoolMint: agent.token_mint,
                rewardAmountUsdc: split.stakerRewardUsdc,
                nonce: nextEpochNumber,
              })

              // Fund the reward pool
              await fundRewardPool({
                stakePool: pool.streamflow_pool_id,
                stakePoolMint: agent.token_mint,
                amountUsdc: split.stakerRewardUsdc,
                nonce: nextEpochNumber,
              })

              result.rewardPoolId = rewardResult.rewardPoolId

              // Mark epoch as distributed
              await updateEpochStatus(epoch.id, 'distributed', {
                streamflow_reward_pool_id: rewardResult.rewardPoolId,
                distribution_tx: rewardResult.txSignature,
              })
            } catch (err) {
              // On-chain funding failed — mark epoch as failed but keep DB records
              await updateEpochStatus(epoch.id, 'failed')
              result.error = `Streamflow funding failed: ${(err as Error).message}`
              console.error(`[epoch-cron] Streamflow failed for ${agent.slug}:`, (err as Error).message)
            }
          } else {
            // No staking pool — mark as distributed (rewards accumulate off-chain)
            await updateEpochStatus(epoch.id, 'distributed')
          }
        } else {
          // No on-chain funding possible — mark as distributed
          await updateEpochStatus(epoch.id, 'distributed')
        }

        results.push(result)
      } catch (err) {
        results.push({
          slug: agent.slug,
          epochNumber: 0,
          usageCount: 0,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const processed = results.filter((r) => r.usageCount > 0).length
    const skipped = results.filter((r) => r.usageCount === 0 && !r.error).length
    const failed = results.filter((r) => r.error).length
    const funded = results.filter((r) => r.rewardPoolId).length

    return NextResponse.json({
      message: `Epoch cron complete: ${processed} processed, ${funded} funded on-chain, ${skipped} skipped, ${failed} failed`,
      solanaConfigured: solanaReady,
      results,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
