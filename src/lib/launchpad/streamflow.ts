/**
 * Streamflow Staking SDK Integration
 *
 * Creates staking pools and manages epoch-based reward distribution
 * for launched agents. Token holders stake agent tokens to earn
 * revenue share (USDC) from agent usage.
 *
 * All Solana infrastructure provided by SolanaService.
 *
 * Flow:
 *   1. Agent activates → createAgentStakePool() creates a Streamflow stake pool
 *   2. Users stake agent tokens → buildStakeTransaction() for client signing
 *   3. Weekly epoch cron → createRewardPoolForEpoch() + fundRewardPool()
 *   4. Stakers claim rewards proportional to stake weight
 */

import 'server-only'

import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

import {
  getAuthority as _getAuthority,
  getConnection,
  withRetry,
  confirmTransaction,
  isConfigured,
  USDC_MINT,
  usdcToLamports,
} from './solana-service'

// Streamflow bundles its own @solana/web3.js; our Keypair type would fail TS
// even though it's structurally identical at runtime. Cast through `any`.
function getAuthority(): any {
  return _getAuthority()
}

// ============================================================================
// Configuration
// ============================================================================

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

const MIN_STAKE_DURATION = new BN(86400) // 1 day (seconds)
const MAX_STAKE_DURATION = new BN(86400 * 365) // 1 year
const REWARD_MULTIPLIER = new BN(2_000_000_000) // 2x for max duration stakers
const REWARD_PERIOD = new BN(604800) // 7 days (weekly epoch)

// ============================================================================
// Optional SDK Boundary
// ============================================================================

type StreamflowInvocation = { invoker: unknown }

interface StreamflowStakingClient {
  createStakePool(
    params: Record<string, unknown>,
    options: StreamflowInvocation,
  ): Promise<{ metadataId: { toBase58(): string }; txId: string }>
  createRewardPool(
    params: Record<string, unknown>,
    options: StreamflowInvocation,
  ): Promise<{ metadataId: { toBase58(): string }; txId: string }>
  fundPool(
    params: Record<string, unknown>,
    options: StreamflowInvocation,
  ): Promise<{ txId: string }>
  getStakePool(stakePoolId: PublicKey): Promise<unknown>
  searchRewardPools(params: Record<string, unknown>): Promise<unknown[]>
  searchStakeEntries(params: Record<string, unknown>): Promise<Array<{
    payer?: { toBase58?: () => string }
    authority?: { toBase58?: () => string }
  }>>
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
      'Streamflow staking is not installed. Install @streamflow/staking in a deployment that enables launchpad staking.',
      { cause: error },
    )
  }
}

let _client: StreamflowStakingClient | null = null

export async function getStakingClient(): Promise<StreamflowStakingClient> {
  if (!_client) {
    const { SolanaStakingClient } = await loadStreamflowModule()
    _client = new SolanaStakingClient({
      clusterUrl: SOLANA_RPC_URL,
      cluster: 'mainnet' as any,
    })
  }
  return _client
}

// ============================================================================
// Stake Pool Management
// ============================================================================

export interface CreateStakePoolConfig {
  /** The agent token mint address */
  tokenMint: string
  /** Nonce for PDA derivation (default 0) */
  nonce?: number
}

export interface StakePoolResult {
  /** On-chain stake pool PDA address */
  stakePoolId: string
  /** Transaction signature */
  txSignature: string
}

/**
 * Create a Streamflow stake pool for an agent token.
 * Called once when an agent transitions to 'trading' status.
 * Uses the authority keypair from SolanaService.
 *
 * Includes retry on transient failures and tx confirmation.
 */
export async function createAgentStakePool(
  config: CreateStakePoolConfig,
): Promise<StakePoolResult> {
  const authority = getAuthority()
  if (!authority) throw new Error('Cannot create stake pool: authority keypair not configured')

  const client = await getStakingClient()
  const nonce = config.nonce ?? 0

  const { metadataId, txId } = await withRetry(
    () =>
      client.createStakePool(
        {
          mint: config.tokenMint,
          nonce,
          maxWeight: REWARD_MULTIPLIER,
          minDuration: MIN_STAKE_DURATION,
          maxDuration: MAX_STAKE_DURATION,
          permissionless: false, // Only our authority can create reward pools
        },
        { invoker: authority },
      ),
    { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 10000 },
  )

  // Confirm the transaction landed
  await confirmTransaction(txId)

  return {
    stakePoolId: metadataId.toBase58(),
    txSignature: txId,
  }
}

// ============================================================================
// Reward Pool Management (Epoch-Based)
// ============================================================================

export interface CreateRewardPoolConfig {
  /** Stake pool PDA address */
  stakePool: string
  /** Agent token mint address */
  stakePoolMint: string
  /** Amount of USDC to distribute this epoch (human-readable, e.g. 150.50) */
  rewardAmountUsdc: number
  /** Reward pool nonce (use epoch number to ensure uniqueness) */
  nonce: number
}

export interface RewardPoolResult {
  /** On-chain reward pool PDA address */
  rewardPoolId: string
  /** Transaction signature */
  txSignature: string
}

/**
 * Create a USDC reward pool for a specific epoch.
 * Called by the weekly epoch cron after calculating revenue splits.
 * Uses the authority keypair from SolanaService.
 */
export async function createRewardPoolForEpoch(
  config: CreateRewardPoolConfig,
): Promise<RewardPoolResult> {
  const authority = getAuthority()
  if (!authority) throw new Error('Cannot create reward pool: authority keypair not configured')

  const client = await getStakingClient()
  const rewardAmountLamports = new BN(usdcToLamports(config.rewardAmountUsdc))

  const { metadataId, txId } = await withRetry(
    () =>
      client.createRewardPool(
        {
          stakePool: config.stakePool,
          stakePoolMint: config.stakePoolMint,
          stakePoolNonce: 0,
          rewardMint: USDC_MINT,
          nonce: config.nonce,
          rewardAmount: rewardAmountLamports,
          rewardPeriod: REWARD_PERIOD,
          permissionless: false,
          lastClaimPeriodOpt: null,
        },
        { invoker: authority },
      ),
  )

  await confirmTransaction(txId)

  return {
    rewardPoolId: metadataId.toBase58(),
    txSignature: txId,
  }
}

// ============================================================================
// Fund Rewards
// ============================================================================

export interface FundRewardPoolConfig {
  /** Stake pool PDA address */
  stakePool: string
  /** Agent token mint address */
  stakePoolMint: string
  /** USDC amount to fund (human-readable) */
  amountUsdc: number
  /** Reward pool nonce (epoch number) */
  nonce: number
  /** Fee value PDA (null if no fee override) */
  feeValue?: string | null
}

/**
 * Fund an existing reward pool with USDC.
 * The authority wallet must hold sufficient USDC balance.
 */
export async function fundRewardPool(
  config: FundRewardPoolConfig,
): Promise<{ txSignature: string }> {
  const authority = getAuthority()
  if (!authority) throw new Error('Cannot fund reward pool: authority keypair not configured')

  const client = await getStakingClient()
  const amountLamports = new BN(usdcToLamports(config.amountUsdc))

  const { txId } = await withRetry(
    () =>
      client.fundPool(
        {
          stakePool: config.stakePool,
          stakePoolMint: config.stakePoolMint,
          amount: amountLamports,
          nonce: config.nonce,
          rewardMint: USDC_MINT,
          feeValue: config.feeValue ?? null,
        },
        { invoker: authority },
      ),
  )

  await confirmTransaction(txId)

  return { txSignature: txId }
}

// ============================================================================
// Stake Transaction Builder (for client-side signing)
// ============================================================================

export interface BuildStakeParams {
  /** Stake pool PDA address */
  stakePoolId: string
  /** Agent token mint */
  tokenMint: string
  /** Amount of tokens to stake (human-readable) */
  amount: number
  /** Stake duration in seconds */
  durationSeconds: number
  /** Staker's wallet address */
  stakerWallet: string
}

/**
 * Build stake pool info needed for client-side staking.
 * Client uses Streamflow SDK directly with their wallet adapter.
 * We return the pool config + validated parameters.
 */
export async function getStakeParams(params: BuildStakeParams) {
  const pool = await getStakePool(params.stakePoolId)
  if (!pool) throw new Error('Stake pool not found on-chain')

  return {
    stakePool: params.stakePoolId,
    stakePoolMint: params.tokenMint,
    amount: params.amount,
    duration: params.durationSeconds,
    nonce: 0,
    // Client will pass these to SolanaStakingClient.stake() with their wallet
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

/** Fetch a stake pool's on-chain state */
export async function getStakePool(stakePoolId: string) {
  const client = await getStakingClient()
  return withRetry(() => client.getStakePool(new PublicKey(stakePoolId)))
}

/** Search for all reward pools associated with a stake pool */
export async function getRewardPools(stakePoolId: string) {
  const client = await getStakingClient()
  return withRetry(() =>
    client.searchRewardPools({ stakePool: new PublicKey(stakePoolId) as any }),
  )
}

/** Get all active stakes for a specific wallet in a stake pool */
export async function getWalletStakes(stakePoolId: string, walletAddress: string) {
  const client = await getStakingClient()
  // searchStakeEntries filters by stakePool; we filter by payer (wallet) client-side
  const entries = await withRetry(() =>
    client.searchStakeEntries({
      stakePool: new PublicKey(stakePoolId) as any,
    }),
  )
  // Filter to the specific wallet's stakes
  return entries?.filter(
    (e: any) => e.payer?.toBase58?.() === walletAddress || e.authority?.toBase58?.() === walletAddress,
  ) ?? []
}
