/**
 * Agent Launchpad Contracts
 *
 * Pure TypeScript + Zod schemas shared between:
 * - src/ (Next.js app on Vercel)
 * - worker/ (Event processor on Railway)
 *
 * NO framework dependencies allowed here.
 */

import { z } from 'zod'

// =============================================================================
// ENUMS
// =============================================================================

export const LaunchpadCategory = z.enum([
  'general', 'trading', 'research', 'creative',
  'data', 'social', 'defi', 'gaming', 'other',
])
export type LaunchpadCategory = z.infer<typeof LaunchpadCategory>

export const LaunchStatus = z.enum([
  'draft', 'launching', 'trading', 'sunset', 'archived',
])
export type LaunchStatus = z.infer<typeof LaunchStatus>

export const WalletSource = z.enum(['privy', 'external'])
export type WalletSource = z.infer<typeof WalletSource>

export const PaymentMethod = z.enum(['crypto', 'fiat'])
export type PaymentMethod = z.infer<typeof PaymentMethod>

export const DepositStatus = z.enum(['pending', 'confirmed', 'settled', 'refunded'])
export type DepositStatus = z.infer<typeof DepositStatus>

export const StakingPoolStatus = z.enum(['creating', 'active', 'paused', 'closed'])
export type StakingPoolStatus = z.infer<typeof StakingPoolStatus>

export const EpochStatus = z.enum(['pending', 'calculating', 'distributed', 'failed'])
export type EpochStatus = z.infer<typeof EpochStatus>

// =============================================================================
// LAUNCHED AGENT
// =============================================================================

export const LaunchedAgentSchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  creator_id: z.string().uuid().nullable(),
  creator_wallet: z.string(),
  org_id: z.string().uuid(),

  slug: z.string().min(1).max(100),
  display_name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  avatar_url: z.string().url().nullable(),
  category: LaunchpadCategory,
  tags: z.array(z.string()).default([]),

  chain: z.string().default('solana'),
  token_mint: z.string().nullable(),
  genesis_pool_id: z.string().nullable(),
  token_supply: z.number().int().positive().default(1_000_000_000),
  creator_alloc_bps: z.number().int().min(0).max(10000).default(1000),

  agent_wallet_address: z.string().nullable(),
  wallet_source: WalletSource,

  price_per_request: z.number().positive().default(0.01),
  platform_fee_bps: z.number().int().min(0).max(10000).default(1500),

  status: LaunchStatus,

  total_requests: z.number().int().default(0),
  total_revenue_usdc: z.number().default(0),
  total_staked: z.number().int().default(0),
  holder_count: z.number().int().default(0),

  launched_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type LaunchedAgent = z.infer<typeof LaunchedAgentSchema>

// =============================================================================
// CREATE / UPDATE INPUTS
// =============================================================================

export const CreateLaunchedAgentInput = z.object({
  assistant_id: z.string().uuid().optional(),
  creator_wallet: z.string().min(1),
  org_id: z.string().uuid().optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  display_name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  avatar_url: z.string().url().optional(),
  category: LaunchpadCategory.optional(),
  tags: z.array(z.string()).optional(),
  token_supply: z.number().int().positive().optional(),
  creator_alloc_bps: z.number().int().min(0).max(5000).optional(),
  agent_wallet_address: z.string().optional(),
  price_per_request: z.number().positive().optional(),
  platform_fee_bps: z.number().int().min(0).max(5000).optional(),
})
export type CreateLaunchedAgentInput = z.infer<typeof CreateLaunchedAgentInput>

export const UpdateLaunchedAgentInput = z.object({
  display_name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  avatar_url: z.string().url().optional(),
  category: LaunchpadCategory.optional(),
  tags: z.array(z.string()).optional(),
  price_per_request: z.number().positive().optional(),
  status: LaunchStatus.optional(),
  token_mint: z.string().optional(),
  genesis_pool_id: z.string().optional(),
})
export type UpdateLaunchedAgentInput = z.infer<typeof UpdateLaunchedAgentInput>

// =============================================================================
// LAUNCH DEPOSIT
// =============================================================================

export const LaunchDepositSchema = z.object({
  id: z.string().uuid(),
  launched_agent_id: z.string().uuid(),
  depositor_wallet: z.string(),
  depositor_user_id: z.string().uuid().nullable(),
  amount_sol: z.number().positive(),
  tx_signature: z.string(),
  tokens_received: z.number().int().nullable(),
  status: DepositStatus,
  created_at: z.string(),
})
export type LaunchDeposit = z.infer<typeof LaunchDepositSchema>

export const RecordDepositInput = z.object({
  launched_agent_id: z.string().uuid(),
  depositor_wallet: z.string().min(1),
  amount_sol: z.number().positive(),
  tx_signature: z.string().min(1),
})
export type RecordDepositInput = z.infer<typeof RecordDepositInput>

// =============================================================================
// STAKING POOL
// =============================================================================

export const StakingPoolSchema = z.object({
  id: z.string().uuid(),
  launched_agent_id: z.string().uuid(),
  streamflow_pool_id: z.string(),
  reward_mint: z.string(),
  total_staked: z.number().int().default(0),
  total_rewards_distributed: z.number().default(0),
  status: StakingPoolStatus,
  created_at: z.string(),
  updated_at: z.string(),
})
export type StakingPool = z.infer<typeof StakingPoolSchema>

// =============================================================================
// REVENUE EPOCH
// =============================================================================

export const RevenueEpochSchema = z.object({
  id: z.string().uuid(),
  launched_agent_id: z.string().uuid(),
  epoch_number: z.number().int(),
  period_start: z.string(),
  period_end: z.string(),
  gross_revenue_usdc: z.number().default(0),
  platform_fee_usdc: z.number().default(0),
  staker_reward_usdc: z.number().default(0),
  inference_cost_usdc: z.number().default(0),
  streamflow_reward_pool_id: z.string().nullable(),
  distribution_tx: z.string().nullable(),
  status: EpochStatus,
  request_count: z.number().int().default(0),
  created_at: z.string(),
})
export type RevenueEpoch = z.infer<typeof RevenueEpochSchema>

// =============================================================================
// USAGE LEDGER
// =============================================================================

export const AgentUsageSchema = z.object({
  id: z.string().uuid(),
  launched_agent_id: z.string().uuid(),
  user_wallet: z.string().nullable(),
  user_id: z.string().uuid().nullable(),
  payment_method: PaymentMethod,
  amount_usdc: z.number().positive(),
  tx_signature: z.string().nullable(),
  stripe_payment_id: z.string().nullable(),
  epoch_number: z.number().int().nullable(),
  tokens_used: z.number().int().default(0),
  created_at: z.string(),
})
export type AgentUsage = z.infer<typeof AgentUsageSchema>

export const RecordUsageInput = z.object({
  launched_agent_id: z.string().uuid(),
  user_wallet: z.string().optional(),
  user_id: z.string().uuid().optional(),
  payment_method: PaymentMethod,
  amount_usdc: z.number().positive(),
  tx_signature: z.string().optional(),
  stripe_payment_id: z.string().optional(),
  tokens_used: z.number().int().min(0).default(0),
})
export type RecordUsageInput = z.infer<typeof RecordUsageInput>

// =============================================================================
// API RESPONSE SHAPES
// =============================================================================

export const LaunchedAgentListItem = LaunchedAgentSchema.pick({
  id: true,
  slug: true,
  display_name: true,
  description: true,
  avatar_url: true,
  category: true,
  tags: true,
  status: true,
  total_requests: true,
  total_revenue_usdc: true,
  holder_count: true,
  price_per_request: true,
  token_mint: true,
  launched_at: true,
})
export type LaunchedAgentListItem = z.infer<typeof LaunchedAgentListItem>
