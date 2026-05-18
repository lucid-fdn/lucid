/**
 * CTF Executor — On-chain Conditional Token Framework operations.
 *
 * Handles split (USDC → YES+NO tokens), merge (YES+NO → USDC),
 * and redeem (winning tokens → USDC after resolution)
 * via the CTF contract on Polygon. Uses Privy agent wallet for signing.
 */

import { executeAgentWalletTransaction } from '../../../services/session-signer/index.js'
import type { CtfSplitParams, CtfMergeParams, CtfOperationResult } from './types.js'
import { encodeFunctionData, parseUnits } from './abi-utils.js'
import {
  POLYMARKET_CONTRACTS,
  POLYGON_CHAIN_ID,
  ZERO_BYTES32,
  USDC_DECIMALS,
  BINARY_PARTITION,
} from './constants.js'

// ============================================================================
// USDC.e Approval
// ============================================================================

/**
 * Approve a spender to use USDC.e (required before splitPosition).
 * Uses max uint256 approval to avoid repeated approvals.
 * For neg-risk markets, spender should be NEG_RISK_ADAPTER.
 */
export async function ensureUsdcApproval(
  assistantId: string,
  spender: string = POLYMARKET_CONTRACTS.CTF,
): Promise<CtfOperationResult> {
  const data = encodeFunctionData('approve', [
    spender,
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  ])

  const result = await executeAgentWalletTransaction(assistantId, {
    chainType: 'ethereum',
    chainId: POLYGON_CHAIN_ID,
    to: POLYMARKET_CONTRACTS.USDC_E,
    data,
    value: '0',
  })

  return { success: result.success, txHash: result.txHash, error: result.error }
}

// ============================================================================
// CTF Approval (for exchange)
// ============================================================================

/**
 * Approve CTF Exchange (or Neg Risk Exchange) as operator for CTF tokens.
 * Required before placing orders that sell outcome tokens.
 * For neg-risk markets, operator should be NEG_RISK_CTF_EXCHANGE.
 */
export async function ensureCtfApproval(
  assistantId: string,
  operator: string = POLYMARKET_CONTRACTS.CTF_EXCHANGE,
): Promise<CtfOperationResult> {
  const data = encodeFunctionData('setApprovalForAll', [operator, true])

  const result = await executeAgentWalletTransaction(assistantId, {
    chainType: 'ethereum',
    chainId: POLYGON_CHAIN_ID,
    to: POLYMARKET_CONTRACTS.CTF,
    data,
    value: '0',
  })

  return { success: result.success, txHash: result.txHash, error: result.error }
}

// ============================================================================
// Split Position (USDC → YES + NO tokens)
// ============================================================================

/**
 * Split USDC.e into YES + NO outcome tokens for a condition.
 * Requires prior USDC.e approval to CTF contract.
 */
export async function splitPosition(
  assistantId: string,
  params: CtfSplitParams,
): Promise<CtfOperationResult> {
  const amountRaw = parseUnits(params.amount, USDC_DECIMALS)

  const data = encodeFunctionData('splitPosition', [
    POLYMARKET_CONTRACTS.USDC_E,
    ZERO_BYTES32,
    params.conditionId,
    [...BINARY_PARTITION],
    amountRaw,
  ])

  const result = await executeAgentWalletTransaction(assistantId, {
    chainType: 'ethereum',
    chainId: POLYGON_CHAIN_ID,
    to: POLYMARKET_CONTRACTS.CTF,
    data,
    value: '0',
  })

  return { success: result.success, txHash: result.txHash, error: result.error }
}

// ============================================================================
// Merge Positions (YES + NO tokens → USDC)
// ============================================================================

/**
 * Merge equal amounts of YES + NO tokens back into USDC.e.
 */
export async function mergePositions(
  assistantId: string,
  params: CtfMergeParams,
): Promise<CtfOperationResult> {
  const amountRaw = parseUnits(params.amount, USDC_DECIMALS)

  const data = encodeFunctionData('mergePositions', [
    POLYMARKET_CONTRACTS.USDC_E,
    ZERO_BYTES32,
    params.conditionId,
    [...BINARY_PARTITION],
    amountRaw,
  ])

  const result = await executeAgentWalletTransaction(assistantId, {
    chainType: 'ethereum',
    chainId: POLYGON_CHAIN_ID,
    to: POLYMARKET_CONTRACTS.CTF,
    data,
    value: '0',
  })

  return { success: result.success, txHash: result.txHash, error: result.error }
}

// ============================================================================
// Redeem Positions (Winning tokens → USDC after market resolution)
// ============================================================================

/**
 * Redeem resolved outcome tokens back into USDC.e.
 * Call after a market has been resolved — winning tokens are redeemed for collateral.
 *
 * @param assistantId — Agent wallet identifier
 * @param conditionId — The resolved market's conditionId
 * @param indexSets — Which outcome slots to try redeeming (default: both YES=1 and NO=2)
 */
export async function redeemPositions(
  assistantId: string,
  conditionId: string,
  indexSets: number[] = [...BINARY_PARTITION],
): Promise<CtfOperationResult> {
  const data = encodeFunctionData('redeemPositions', [
    POLYMARKET_CONTRACTS.USDC_E,
    ZERO_BYTES32,
    conditionId,
    indexSets,
  ])

  const result = await executeAgentWalletTransaction(assistantId, {
    chainType: 'ethereum',
    chainId: POLYGON_CHAIN_ID,
    to: POLYMARKET_CONTRACTS.CTF,
    data,
    value: '0',
  })

  return { success: result.success, txHash: result.txHash, error: result.error }
}
