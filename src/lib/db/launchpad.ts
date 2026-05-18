/**
 * Launchpad Database Operations (Server-only)
 *
 * CRUD for launched_agents, launch_deposits, staking_pools,
 * revenue_epochs, and agent_usage_ledger.
 */

import 'server-only'
import { supabase, ErrorService } from './client'
import type {
  CreateLaunchedAgentInput,
  UpdateLaunchedAgentInput,
  LaunchedAgent,
  LaunchDeposit,
  RecordDepositInput,
  StakingPool,
  RevenueEpoch,
  AgentUsage,
  RecordUsageInput,
} from '../../../contracts/launchpad'

const LAUNCHED_AGENT_SELECT = `
  id,
  assistant_id,
  creator_id,
  creator_wallet,
  org_id,
  slug,
  display_name,
  description,
  avatar_url,
  category,
  tags,
  chain,
  token_mint,
  genesis_pool_id,
  token_supply,
  creator_alloc_bps,
  agent_wallet_address,
  wallet_source,
  price_per_request,
  platform_fee_bps,
  status,
  total_requests,
  total_revenue_usdc,
  total_staked,
  holder_count,
  launched_at,
  created_at,
  updated_at
` as const

const LAUNCH_DEPOSIT_SELECT = `
  id,
  launched_agent_id,
  depositor_wallet,
  depositor_user_id,
  amount_sol,
  tx_signature,
  tokens_received,
  status,
  created_at
` as const

const STAKING_POOL_SELECT = `
  id,
  launched_agent_id,
  streamflow_pool_id,
  reward_mint,
  total_staked,
  total_rewards_distributed,
  status,
  created_at,
  updated_at
` as const

const REVENUE_EPOCH_SELECT = `
  id,
  launched_agent_id,
  epoch_number,
  period_start,
  period_end,
  gross_revenue_usdc,
  platform_fee_usdc,
  staker_reward_usdc,
  inference_cost_usdc,
  streamflow_reward_pool_id,
  distribution_tx,
  status,
  request_count,
  created_at
` as const

const AGENT_USAGE_SELECT = `
  id,
  launched_agent_id,
  user_wallet,
  user_id,
  payment_method,
  amount_usdc,
  tx_signature,
  stripe_payment_id,
  epoch_number,
  tokens_used,
  created_at
` as const

// =============================================================================
// LAUNCHED AGENTS
// =============================================================================

export async function getLaunchedAgents(options?: {
  status?: string
  category?: string
  limit?: number
  offset?: number
}): Promise<LaunchedAgent[]> {
  try {
    let query = supabase
      .from('launched_agents')
      .select(LAUNCHED_AGENT_SELECT)
      .order('launched_at', { ascending: false, nullsFirst: false })

    if (options?.status) query = query.eq('status', options.status)
    if (options?.category) query = query.eq('category', options.category)
    if (options?.limit) query = query.limit(options.limit)
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as LaunchedAgent[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'launched_agents' },
      tags: { layer: 'database', table: 'launched_agents' },
    })
    return []
  }
}

export async function getLaunchedAgentBySlug(slug: string): Promise<LaunchedAgent | null> {
  try {
    const { data, error } = await supabase
      .from('launched_agents')
      .select(LAUNCHED_AGENT_SELECT)
      .eq('slug', slug)
      .single()

    if (error) throw error
    return data as LaunchedAgent
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'launched_agents', slug },
      tags: { layer: 'database', table: 'launched_agents' },
    })
    return null
  }
}

/** Resolve an agent by slug or UUID (useful for unified [slug] routes) */
export async function resolveAgent(slugOrId: string): Promise<LaunchedAgent | null> {
  // UUID pattern check
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
  if (isUuid) return getLaunchedAgentById(slugOrId)
  return getLaunchedAgentBySlug(slugOrId)
}

export async function getLaunchedAgentById(id: string): Promise<LaunchedAgent | null> {
  try {
    const { data, error } = await supabase
      .from('launched_agents')
      .select(LAUNCHED_AGENT_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error
    return data as LaunchedAgent
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'launched_agents', id },
      tags: { layer: 'database', table: 'launched_agents' },
    })
    return null
  }
}

export async function getLaunchedAgentsByCreator(creatorId: string): Promise<LaunchedAgent[]> {
  try {
    const { data, error } = await supabase
      .from('launched_agents')
      .select(LAUNCHED_AGENT_SELECT)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as LaunchedAgent[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'launched_agents', creatorId },
      tags: { layer: 'database', table: 'launched_agents' },
    })
    return []
  }
}

export async function createLaunchedAgent(
  input: CreateLaunchedAgentInput & { creator_id?: string }
): Promise<LaunchedAgent | null> {
  try {
    const { data, error } = await supabase
      .from('launched_agents')
      .insert(input)
      .select(LAUNCHED_AGENT_SELECT)
      .single()

    if (error) throw error
    return data as LaunchedAgent
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'launched_agents' },
      tags: { layer: 'database', table: 'launched_agents' },
    })
    return null
  }
}

export async function updateLaunchedAgent(
  id: string,
  input: UpdateLaunchedAgentInput | Record<string, unknown>
): Promise<LaunchedAgent | null> {
  try {
    const { data, error } = await supabase
      .from('launched_agents')
      .update(input)
      .eq('id', id)
      .select(LAUNCHED_AGENT_SELECT)
      .single()

    if (error) throw error
    return data as LaunchedAgent
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'launched_agents', id },
      tags: { layer: 'database', table: 'launched_agents' },
    })
    return null
  }
}

export async function incrementAgentStats(
  id: string,
  stats: {
    total_requests?: number
    total_revenue_usdc?: number
    total_staked?: number
    holder_count?: number
  }
): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_agent_stats', {
      p_agent_id: id,
      p_requests: stats.total_requests ?? 0,
      p_revenue: stats.total_revenue_usdc ?? 0,
      p_staked: stats.total_staked ?? 0,
      p_holders: stats.holder_count ?? 0,
    })
    if (error) throw error
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'RPC', table: 'launched_agents', id },
      tags: { layer: 'database', table: 'launched_agents' },
    })
  }
}

// =============================================================================
// LAUNCH DEPOSITS
// =============================================================================

export async function recordDeposit(
  input: RecordDepositInput & { depositor_user_id?: string }
): Promise<LaunchDeposit | null> {
  try {
    const { data, error } = await supabase
      .from('launch_deposits')
      .insert(input)
      .select(LAUNCH_DEPOSIT_SELECT)
      .single()

    if (error) throw error
    return data as LaunchDeposit
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'launch_deposits' },
      tags: { layer: 'database', table: 'launch_deposits' },
    })
    return null
  }
}

export async function getDepositsForAgent(agentId: string): Promise<LaunchDeposit[]> {
  try {
    const { data, error } = await supabase
      .from('launch_deposits')
      .select(LAUNCH_DEPOSIT_SELECT)
      .eq('launched_agent_id', agentId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as LaunchDeposit[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'launch_deposits', agentId },
      tags: { layer: 'database', table: 'launch_deposits' },
    })
    return []
  }
}

// =============================================================================
// STAKING POOLS
// =============================================================================

export async function getStakingPool(agentId: string): Promise<StakingPool | null> {
  try {
    const { data, error } = await supabase
      .from('staking_pools')
      .select(STAKING_POOL_SELECT)
      .eq('launched_agent_id', agentId)
      .eq('status', 'active')
      .single()

    if (error) throw error
    return data as StakingPool
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'staking_pools', agentId },
      tags: { layer: 'database', table: 'staking_pools' },
    })
    return null
  }
}

export async function createStakingPool(
  agentId: string,
  streamflowPoolId: string,
  rewardMint: string = 'USDC'
): Promise<StakingPool | null> {
  try {
    const { data, error } = await supabase
      .from('staking_pools')
      .insert({
        launched_agent_id: agentId,
        streamflow_pool_id: streamflowPoolId,
        reward_mint: rewardMint,
      })
      .select(STAKING_POOL_SELECT)
      .single()

    if (error) throw error
    return data as StakingPool
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'staking_pools', agentId },
      tags: { layer: 'database', table: 'staking_pools' },
    })
    return null
  }
}

// =============================================================================
// REVENUE EPOCHS
// =============================================================================

export async function getEpochsForAgent(agentId: string): Promise<RevenueEpoch[]> {
  try {
    const { data, error } = await supabase
      .from('revenue_epochs')
      .select(REVENUE_EPOCH_SELECT)
      .eq('launched_agent_id', agentId)
      .order('epoch_number', { ascending: false })

    if (error) throw error
    return (data ?? []) as RevenueEpoch[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'revenue_epochs', agentId },
      tags: { layer: 'database', table: 'revenue_epochs' },
    })
    return []
  }
}

export async function getLatestEpoch(agentId: string): Promise<RevenueEpoch | null> {
  try {
    const { data, error } = await supabase
      .from('revenue_epochs')
      .select(REVENUE_EPOCH_SELECT)
      .eq('launched_agent_id', agentId)
      .order('epoch_number', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error
    return data as RevenueEpoch
  } catch {
    return null
  }
}

export async function createEpoch(epoch: {
  launched_agent_id: string
  epoch_number: number
  period_start: string
  period_end: string
  gross_revenue_usdc: number
  platform_fee_usdc: number
  staker_reward_usdc: number
  inference_cost_usdc: number
  request_count: number
}): Promise<RevenueEpoch | null> {
  try {
    const { data, error } = await supabase
      .from('revenue_epochs')
      .insert(epoch)
      .select(REVENUE_EPOCH_SELECT)
      .single()

    if (error) throw error
    return data as RevenueEpoch
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'revenue_epochs' },
      tags: { layer: 'database', table: 'revenue_epochs' },
    })
    return null
  }
}

export async function updateEpochStatus(
  epochId: string,
  status: string,
  extra?: { streamflow_reward_pool_id?: string; distribution_tx?: string }
): Promise<void> {
  try {
    const { error } = await supabase
      .from('revenue_epochs')
      .update({ status, ...extra })
      .eq('id', epochId)

    if (error) throw error
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'revenue_epochs', epochId },
      tags: { layer: 'database', table: 'revenue_epochs' },
    })
  }
}

// =============================================================================
// USAGE LEDGER
// =============================================================================

export async function recordUsage(
  input: RecordUsageInput
): Promise<AgentUsage | null> {
  try {
    const { data, error } = await supabase
      .from('agent_usage_ledger')
      .insert(input)
      .select(AGENT_USAGE_SELECT)
      .single()

    if (error) throw error
    return data as AgentUsage
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'agent_usage_ledger' },
      tags: { layer: 'database', table: 'agent_usage_ledger' },
    })
    return null
  }
}

export async function getUnassignedUsage(agentId: string): Promise<AgentUsage[]> {
  try {
    const { data, error } = await supabase
      .from('agent_usage_ledger')
      .select(AGENT_USAGE_SELECT)
      .eq('launched_agent_id', agentId)
      .is('epoch_number', null)

    if (error) throw error
    return (data ?? []) as AgentUsage[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'agent_usage_ledger', agentId },
      tags: { layer: 'database', table: 'agent_usage_ledger' },
    })
    return []
  }
}

export async function assignUsageToEpoch(
  agentId: string,
  epochNumber: number,
  usageIds?: string[]
): Promise<number> {
  try {
    let query = supabase
      .from('agent_usage_ledger')
      .update({ epoch_number: epochNumber })
      .eq('launched_agent_id', agentId)
      .is('epoch_number', null)

    if (usageIds) {
      query = query.in('id', usageIds)
    }

    const { data, error } = await query.select('id')

    if (error) throw error
    return data?.length ?? 0
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'agent_usage_ledger', agentId },
      tags: { layer: 'database', table: 'agent_usage_ledger' },
    })
    return 0
  }
}

export async function getAgentUsageStats(agentId: string): Promise<{
  total_usdc: number
  total_requests: number
}> {
  try {
    const { data, error } = await supabase
      .from('agent_usage_ledger')
      .select('amount_usdc')
      .eq('launched_agent_id', agentId)

    if (error) throw error
    const rows = data ?? []
    return {
      total_usdc: rows.reduce((sum, r) => sum + Number(r.amount_usdc), 0),
      total_requests: rows.length,
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'agent_usage_ledger', agentId },
      tags: { layer: 'database', table: 'agent_usage_ledger' },
    })
    return { total_usdc: 0, total_requests: 0 }
  }
}
