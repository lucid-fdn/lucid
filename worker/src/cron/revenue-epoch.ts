/**
 * Revenue Epoch Cron (Worker)
 *
 * Weekly job that:
 * 1. Finds all trading agents with unassigned usage
 * 2. Calculates revenue split per agent
 * 3. Creates epoch records
 * 4. Creates + funds Streamflow reward pools on-chain
 *
 * Follows existing Worker pattern: mutex + pLimit + error handling.
 *
 * NOTE: Worker CANNOT import from src/ (separate build).
 * Solana retry/confirm logic is self-contained here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Connection, Keypair } from '@solana/web3.js'
import BN from 'bn.js'
import pLimit from 'p-limit'

// Use `any` for PublicKey params to avoid version mismatch
type SolanaKeypair = any

const PRIMARY_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const FALLBACK_RPC = process.env.SOLANA_RPC_URL_FALLBACK || PRIMARY_RPC
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const REWARD_PERIOD = new BN(604800) // 7 days

// ============================================================================
// Singletons
// ============================================================================

interface StreamflowStakingClient {
  createRewardPool(
    params: Record<string, unknown>,
    options: { invoker: SolanaKeypair },
  ): Promise<{ metadataId: { toBase58(): string }; txId: string }>
  fundPool(
    params: Record<string, unknown>,
    options: { invoker: SolanaKeypair },
  ): Promise<{ txId: string }>
}

interface StreamflowModule {
  SolanaStakingClient: new (options: {
    clusterUrl: string
    cluster?: string
  }) => StreamflowStakingClient
}

const optionalImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>

async function loadStreamflowModule(): Promise<StreamflowModule> {
  try {
    return (await optionalImport('@streamflow/staking')) as StreamflowModule
  } catch (error) {
    throw new Error(
      'Streamflow staking is not installed. Install @streamflow/staking in workers that enable revenue epoch funding.',
      { cause: error },
    )
  }
}

let _stakingClient: StreamflowStakingClient | null = null
async function getStakingClient(): Promise<StreamflowStakingClient> {
  if (!_stakingClient) {
    const { SolanaStakingClient } = await loadStreamflowModule()
    _stakingClient = new SolanaStakingClient({
      clusterUrl: PRIMARY_RPC,
      cluster: 'mainnet' as any,
    })
  }
  return _stakingClient
}

let _connection: Connection | null = null
function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(PRIMARY_RPC, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60_000,
    })
  }
  return _connection
}

// ============================================================================
// Authority Keypair
// ============================================================================

let _authority: Keypair | null | undefined
async function getAuthorityKeypair(): Promise<Keypair | null> {
  if (_authority !== undefined) return _authority
  const keyStr = process.env.EPOCH_AUTHORITY_KEY || process.env.LAUNCH_AUTHORITY_KEY
  if (!keyStr) {
    _authority = null
    return null
  }
  try {
    const bs58 = await import('bs58')
    _authority = Keypair.fromSecretKey(bs58.default.decode(keyStr))
    return _authority
  } catch (err) {
    console.error('[epoch] Failed to load authority keypair:', err)
    _authority = null
    return null
  }
}

// ============================================================================
// Retry + Confirm Utilities
// ============================================================================

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('429') || msg.includes('503') || msg.includes('504') ||
    msg.includes('timeout') || msg.includes('econnreset') || msg.includes('fetch failed') ||
    msg.includes('blockhash not found')
  )
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelay = 1000): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt === maxAttempts || !isRetryable(err)) throw lastError
      const delay = Math.min(baseDelay * 2 ** (attempt - 1), 10000)
      const jitter = delay * (0.5 + Math.random() * 0.5)
      console.warn(`[epoch] Retry ${attempt}/${maxAttempts}: ${lastError.message}`)
      await new Promise((r) => setTimeout(r, jitter))
    }
  }
  throw lastError!
}

async function confirmTx(signature: string): Promise<void> {
  const conn = getConnection()
  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
    const result = await conn.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    )
    if (result.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
    }
  } catch (err) {
    // Try fallback RPC
    if (FALLBACK_RPC !== PRIMARY_RPC) {
      try {
        const fallback = new Connection(FALLBACK_RPC, { commitment: 'confirmed' })
        const { blockhash, lastValidBlockHeight } = await fallback.getLatestBlockhash('confirmed')
        const result = await fallback.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed',
        )
        if (result.value.err) throw new Error(`Transaction failed on fallback`)
        return
      } catch { /* Fallback also failed */ }
    }
    throw err
  }
}

// ============================================================================
// Revenue Split
// ============================================================================

function calculateSplit(grossUsdc: number, platformFeeBps: number, totalTokens: number) {
  const platformFee = Math.round(grossUsdc * platformFeeBps / 10000 * 1_000_000) / 1_000_000
  const inferenceCost = Math.round(totalTokens * 0.00003 * 1_000_000) / 1_000_000
  const stakerReward = Math.max(0, Math.round((grossUsdc - platformFee - inferenceCost) * 1_000_000) / 1_000_000)
  return { platformFee, inferenceCost, stakerReward }
}

// ============================================================================
// Main Entry
// ============================================================================

const epochLimit = pLimit(5)
let epochRunning = false

export async function runRevenueEpoch(supabase: SupabaseClient): Promise<void> {
  if (epochRunning) return
  epochRunning = true

  try {
    // 1. Get all trading agents
    const { data: agents, error: agentsErr } = await supabase
      .from('launched_agents')
      .select('id, platform_fee_bps, token_mint')
      .eq('status', 'trading')

    if (agentsErr || !agents?.length) {
      if (agentsErr) console.error('[epoch] Failed to fetch agents:', agentsErr.message)
      return
    }

    // 2. Load staking pools
    const { data: pools } = await supabase
      .from('staking_pools')
      .select('launched_agent_id, streamflow_pool_id')
      .eq('status', 'active')

    const poolMap = new Map<string, string>()
    for (const p of pools ?? []) poolMap.set(p.launched_agent_id, p.streamflow_pool_id)

    // 3. Load authority once
    const authority = await getAuthorityKeypair()
    if (!authority) {
      console.warn('[epoch] Authority key not configured — Streamflow funding will be skipped')
    }

    console.log(`[epoch] Processing ${agents.length} trading agents`)

    // 4. Process each agent concurrently (max 5)
    const results = await Promise.allSettled(
      agents.map((agent) =>
        epochLimit(() => processAgentEpoch(
          supabase, agent.id, agent.platform_fee_bps, agent.token_mint,
          poolMap.get(agent.id) ?? null, authority,
        ))
      )
    )

    const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value).length
    const skipped = results.filter((r) => r.status === 'fulfilled' && !r.value).length
    const failed = results.filter((r) => r.status === 'rejected').length

    console.log(`[epoch] Complete: ${succeeded} processed, ${skipped} skipped, ${failed} failed`)
  } catch (err) {
    console.error('[epoch] Fatal error:', err)
  } finally {
    epochRunning = false
  }
}

// ============================================================================
// Per-Agent Processing
// ============================================================================

async function processAgentEpoch(
  supabase: SupabaseClient,
  agentId: string,
  platformFeeBps: number,
  tokenMint: string | null,
  stakePoolId: string | null,
  authority: SolanaKeypair | null,
): Promise<boolean> {
  // 1. Get unassigned usage
  const { data: usage, error: usageErr } = await supabase
    .from('agent_usage_ledger')
    .select('id, amount_usdc, tokens_used')
    .eq('launched_agent_id', agentId)
    .is('epoch_number', null)

  if (usageErr) {
    console.error(`[epoch] Usage fetch failed for ${agentId}:`, usageErr.message)
    return false
  }

  if (!usage?.length) return false

  // 2. Calculate totals + split
  const grossUsdc = usage.reduce((sum, r) => sum + Number(r.amount_usdc), 0)
  const totalTokens = usage.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0)
  const { platformFee, inferenceCost, stakerReward } = calculateSplit(grossUsdc, platformFeeBps, totalTokens)

  // 3. Next epoch number
  const { data: lastEpoch } = await supabase
    .from('revenue_epochs')
    .select('epoch_number')
    .eq('launched_agent_id', agentId)
    .order('epoch_number', { ascending: false })
    .limit(1)
    .single()

  const epochNumber = (lastEpoch?.epoch_number ?? 0) + 1
  const now = new Date()

  // 4. Create epoch record
  const { data: epochRow, error: epochErr } = await supabase
    .from('revenue_epochs')
    .insert({
      launched_agent_id: agentId,
      epoch_number: epochNumber,
      period_start: new Date(now.getTime() - 7 * 86400_000).toISOString(),
      period_end: now.toISOString(),
      gross_revenue_usdc: grossUsdc,
      platform_fee_usdc: platformFee,
      staker_reward_usdc: stakerReward,
      inference_cost_usdc: inferenceCost,
      request_count: usage.length,
      status: 'calculating',
    })
    .select('id')
    .single()

  if (epochErr) {
    console.error(`[epoch] Create epoch failed for ${agentId}:`, epochErr.message)
    return false
  }

  // 5. Assign usage rows
  await supabase
    .from('agent_usage_ledger')
    .update({ epoch_number: epochNumber })
    .eq('launched_agent_id', agentId)
    .is('epoch_number', null)

  // 6. Fund Streamflow reward pool (if possible)
  let rewardPoolId: string | null = null
  let distributionTx: string | null = null

  if (stakePoolId && tokenMint && authority && stakerReward > 0) {
    try {
      const client = await getStakingClient()
      const rewardAmountLamports = new BN(Math.floor(stakerReward * 1_000_000))

      // Create reward pool with retry
      const createResult = await withRetry(() =>
        client.createRewardPool(
          {
            stakePool: stakePoolId,
            stakePoolMint: tokenMint,
            stakePoolNonce: 0,
            rewardMint: USDC_MINT,
            nonce: epochNumber,
            rewardAmount: rewardAmountLamports,
            rewardPeriod: REWARD_PERIOD,
            permissionless: false,
            lastClaimPeriodOpt: null,
          },
          { invoker: authority },
        )
      )

      rewardPoolId = createResult.metadataId.toBase58()
      await confirmTx(createResult.txId)
      console.log(`[epoch] ${agentId}: reward pool ${rewardPoolId} created`)

      // Fund the reward pool with retry
      const fundResult = await withRetry(() =>
        client.fundPool(
          {
            stakePool: stakePoolId,
            stakePoolMint: tokenMint,
            amount: rewardAmountLamports,
            nonce: epochNumber,
            rewardMint: USDC_MINT,
            feeValue: null,
          },
          { invoker: authority },
        )
      )

      distributionTx = fundResult.txId
      await confirmTx(fundResult.txId)
      console.log(`[epoch] ${agentId}: reward pool funded`)
    } catch (err) {
      console.error(`[epoch] ${agentId}: Streamflow funding failed:`, err)
      await supabase
        .from('revenue_epochs')
        .update({ status: 'failed' })
        .eq('id', epochRow.id)

      console.log(`[epoch] ${agentId}: epoch #${epochNumber} — $${grossUsdc.toFixed(6)} gross (FUNDING FAILED)`)
      return true // DB records are valid
    }
  }

  // 7. Mark epoch distributed
  await supabase
    .from('revenue_epochs')
    .update({
      status: 'distributed',
      streamflow_reward_pool_id: rewardPoolId,
      distribution_tx: distributionTx,
    })
    .eq('id', epochRow.id)

  console.log(`[epoch] ${agentId}: epoch #${epochNumber} — $${grossUsdc.toFixed(6)} gross, $${stakerReward.toFixed(6)} stakers, ${usage.length} reqs`)
  return true
}
