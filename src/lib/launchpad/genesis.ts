/**
 * Metaplex Genesis SDK Integration
 *
 * Creates token launches via the Genesis API + Umi framework.
 * All Solana infrastructure (RPC, signer, retry, confirm) provided by SolanaService.
 *
 * Flow:
 *   1. buildCreateLaunchInput() — server builds launch config
 *   2. createGenesisLaunch() — unsigned transactions from Genesis API
 *   3. Client signs via wallet adapter (or server signs via authority)
 *   4. registerGenesisLaunch() — token listed on Genesis
 *   5. Or: executeFullLaunch() — all-in-one server-side flow
 */

import 'server-only'

import {
  createLaunch,
  registerLaunch,
  createAndRegisterLaunch,
  type CreateLaunchInput,
  type CreateLaunchResponse,
  type RegisterLaunchResponse,
  type CreateAndRegisterLaunchResult,
  type LaunchpoolConfig,
  type LockedAllocation,
  type TokenMetadata,
} from '@metaplex-foundation/genesis'

import {
  getUmi,
  genesisConfig,
  withRetry,
  confirmTransaction,
  isConfigured,
} from './solana-service'

// Re-export SDK types for consumers
export type {
  CreateLaunchInput,
  CreateLaunchResponse,
  RegisterLaunchResponse,
  CreateAndRegisterLaunchResult,
  LaunchpoolConfig,
  LockedAllocation,
  TokenMetadata,
}

// ============================================================================
// Lucid Launch Helpers
// ============================================================================

export interface LucidLaunchConfig {
  /** Creator's Solana wallet address */
  creatorWallet: string
  /** Token metadata */
  token: {
    name: string
    symbol: string
    /** Must be an Irys-hosted image URL (https://gateway.irys.xyz/...) */
    image: string
    description?: string
  }
  /** Launchpool sale configuration */
  launchpool: {
    /** Tokens allocated to the launchpool sale (out of 1B total supply) */
    tokenAllocation: number
    /** When deposits open */
    depositStartTime: Date
    /** Minimum raise goal in SOL */
    raiseGoal: number
    /** Basis points of raised funds going to Raydium LP (2000-10000) */
    raydiumLiquidityBps: number
    /** Wallet that receives the non-LP portion of raised funds */
    fundsRecipient: string
  }
  /** Optional locked/vesting allocations (team, advisors, etc.) */
  lockedAllocations?: LockedAllocation[]
  /** Network: defaults to mainnet */
  network?: 'solana-mainnet' | 'solana-devnet'
}

/**
 * Build a Genesis CreateLaunchInput from Lucid Launch config.
 */
export function buildCreateLaunchInput(config: LucidLaunchConfig): CreateLaunchInput {
  return {
    wallet: config.creatorWallet,
    launchType: 'project',
    token: {
      name: config.token.name,
      symbol: config.token.symbol,
      image: config.token.image,
      description: config.token.description,
    },
    network: config.network,
    quoteMint: 'SOL',
    launch: {
      launchpool: {
        tokenAllocation: config.launchpool.tokenAllocation,
        depositStartTime: config.launchpool.depositStartTime,
        raiseGoal: config.launchpool.raiseGoal,
        raydiumLiquidityBps: config.launchpool.raydiumLiquidityBps,
        fundsRecipient: config.launchpool.fundsRecipient,
      },
      lockedAllocations: config.lockedAllocations,
    },
  }
}

/**
 * Create a launch via the Genesis API (step 1).
 * Returns unsigned transactions that must be signed by the creator's wallet.
 * Retries on transient RPC failures.
 */
export async function createGenesisLaunch(
  input: CreateLaunchInput,
): Promise<CreateLaunchResponse> {
  const umi = getUmi()
  return withRetry(() => createLaunch(umi, genesisConfig, input))
}

/**
 * Register a launch after transactions are confirmed on-chain (step 2).
 * Makes the launch visible on the Genesis platform.
 */
export async function registerGenesisLaunch(
  genesisAccount: string,
  createLaunchInput: CreateLaunchInput,
): Promise<RegisterLaunchResponse> {
  const umi = getUmi()
  return withRetry(() =>
    registerLaunch(umi, genesisConfig, {
      genesisAccount,
      createLaunchInput,
    }),
  )
}

/**
 * Full launch flow: create + sign + send + register (all-in-one).
 * Requires authority signer configured via LAUNCH_AUTHORITY_KEY.
 * Includes retry on transient failures and tx confirmation.
 *
 * Returns the result including token mint address.
 * Throws if authority is not configured.
 */
export async function executeFullLaunch(
  input: CreateLaunchInput,
): Promise<CreateAndRegisterLaunchResult> {
  if (!isConfigured()) {
    throw new Error('Cannot execute full launch: LAUNCH_AUTHORITY_KEY not configured')
  }

  const umi = getUmi() // Has signer attached via SolanaService
  const result = await withRetry(
    () => createAndRegisterLaunch(umi, genesisConfig, input),
    { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 15000 },
  )

  // Confirm the on-chain transaction if we have a signature
  const txSig = extractTxSignature(result)
  if (txSig) {
    try {
      await confirmTransaction(txSig)
    } catch (err) {
      console.warn(`[genesis] Tx confirmation timed out for ${txSig}, proceeding (may still land)`)
    }
  }

  return result
}

/**
 * Extract the token mint address from a Genesis launch result.
 * The SDK returns different shapes depending on version.
 */
export function extractTokenMint(result: CreateAndRegisterLaunchResult): string | null {
  const r = result as unknown as Record<string, unknown>
  if (typeof r.mint === 'string') return r.mint
  if (r.mint && typeof (r.mint as any).toString === 'function') return (r.mint as any).toString()
  if (typeof r.tokenMint === 'string') return r.tokenMint
  if (r.tokenMint && typeof (r.tokenMint as any).toString === 'function') return (r.tokenMint as any).toString()
  return null
}

/** Extract tx signature from launch result */
function extractTxSignature(result: CreateAndRegisterLaunchResult): string | null {
  const r = result as unknown as Record<string, unknown>
  if (typeof r.txId === 'string') return r.txId
  if (typeof r.signature === 'string') return r.signature
  return null
}
