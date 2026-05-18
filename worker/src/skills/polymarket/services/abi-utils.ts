/**
 * Minimal ABI encoding utilities for Polymarket contract calls.
 *
 * Avoids pulling in viem/ethers as a dependency — we only need
 * a handful of function selectors for CTF + ERC20 interactions.
 *
 * Selectors are pre-computed (keccak256 of canonical signature, first 4 bytes).
 * Verified against Polygonscan contract ABIs.
 */

import { PolymarketValidationError } from './errors.js'

// ============================================================================
// Pre-computed 4-byte function selectors
// ============================================================================

const SELECTORS: Record<string, string> = {
  'approve': '0x095ea7b3',
  'balanceOf_erc20': '0x70a08231',
  'allowance': '0xdd62ed3e',
  'splitPosition': '0x72ce4275',
  'mergePositions': '0x5d03c2fe',
  'redeemPositions': '0x01a8f068',
  'balanceOf': '0x00fdd58e',
  'isApprovedForAll': '0xe985e9c5',
  'setApprovalForAll': '0xa22cb465',
}

// ============================================================================
// Input Validation
// ============================================================================

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/

function validateAddress(value: string, label: string): void {
  if (!ADDRESS_RE.test(value)) {
    throw new PolymarketValidationError(`Invalid address for ${label}: ${value}`)
  }
}

function validateBytes32(value: string, label: string): void {
  if (!BYTES32_RE.test(value)) {
    throw new PolymarketValidationError(`Invalid bytes32 for ${label}: ${value}`)
  }
}

// ============================================================================
// ABI Encoding Primitives
// ============================================================================

function padLeft(hex: string, bytes: number): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return clean.padStart(bytes * 2, '0')
}

function encodeAddress(address: string): string {
  return padLeft(address, 32)
}

function encodeUint256(value: string | bigint): string {
  const bn = typeof value === 'string' ? BigInt(value) : value
  if (bn < 0n) {
    throw new PolymarketValidationError(`uint256 cannot be negative: ${value}`)
  }
  return padLeft(bn.toString(16), 32)
}

function encodeBytes32(value: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value
  return clean.padEnd(64, '0')
}

function encodeBool(value: boolean): string {
  return padLeft(value ? '1' : '0', 32)
}

// ============================================================================
// Public Encoding API
// ============================================================================

/**
 * Encode a contract function call into hex calldata.
 * Supports the subset of functions needed for Polymarket CTF + ERC20.
 */
export function encodeFunctionData(
  functionName: string,
  args: unknown[],
): string {
  const selector = SELECTORS[functionName]
  if (!selector) {
    throw new PolymarketValidationError(
      `Unknown function: ${functionName}. Known: ${Object.keys(SELECTORS).join(', ')}`,
    )
  }

  let encoded = ''

  switch (functionName) {
    case 'approve': {
      const spender = args[0] as string
      const amount = args[1] as string
      validateAddress(spender, 'spender')
      encoded = encodeAddress(spender) + encodeUint256(amount)
      break
    }

    case 'setApprovalForAll': {
      const operator = args[0] as string
      const approved = args[1] as boolean
      validateAddress(operator, 'operator')
      encoded = encodeAddress(operator) + encodeBool(approved)
      break
    }

    case 'splitPosition':
    case 'mergePositions': {
      const collateral = args[0] as string
      const parentCollectionId = args[1] as string
      const conditionId = args[2] as string
      const partition = args[3] as number[]
      const amount = args[4] as string

      validateAddress(collateral, 'collateral')
      validateBytes32(parentCollectionId, 'parentCollectionId')
      validateBytes32(conditionId, 'conditionId')
      if (!Array.isArray(partition) || partition.length === 0) {
        throw new PolymarketValidationError('partition must be a non-empty array')
      }

      // Static params
      encoded += encodeAddress(collateral)
      encoded += encodeBytes32(parentCollectionId)
      encoded += encodeBytes32(conditionId)
      // Dynamic array offset (5 * 32 = 160 = 0xa0)
      encoded += encodeUint256('160')
      encoded += encodeUint256(amount)
      // Dynamic array: length + elements
      encoded += encodeUint256(String(partition.length))
      for (const p of partition) {
        encoded += encodeUint256(String(p))
      }
      break
    }

    case 'redeemPositions': {
      // redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)
      const collateral = args[0] as string
      const parentCollectionId = args[1] as string
      const conditionId = args[2] as string
      const indexSets = args[3] as number[]

      validateAddress(collateral, 'collateral')
      validateBytes32(parentCollectionId, 'parentCollectionId')
      validateBytes32(conditionId, 'conditionId')
      if (!Array.isArray(indexSets) || indexSets.length === 0) {
        throw new PolymarketValidationError('indexSets must be a non-empty array')
      }

      encoded += encodeAddress(collateral)
      encoded += encodeBytes32(parentCollectionId)
      encoded += encodeBytes32(conditionId)
      // Dynamic array offset (4 * 32 = 128 = 0x80)
      encoded += encodeUint256('128')
      // Dynamic array: length + elements
      encoded += encodeUint256(String(indexSets.length))
      for (const s of indexSets) {
        encoded += encodeUint256(String(s))
      }
      break
    }

    case 'balanceOf':
      encoded = encodeAddress(args[0] as string) + encodeUint256(args[1] as string)
      break

    case 'balanceOf_erc20':
      validateAddress(args[0] as string, 'account')
      encoded = encodeAddress(args[0] as string)
      break

    case 'allowance':
      validateAddress(args[0] as string, 'owner')
      validateAddress(args[1] as string, 'spender')
      encoded = encodeAddress(args[0] as string) + encodeAddress(args[1] as string)
      break

    case 'isApprovedForAll':
      validateAddress(args[0] as string, 'owner')
      validateAddress(args[1] as string, 'operator')
      encoded = encodeAddress(args[0] as string) + encodeAddress(args[1] as string)
      break

    default:
      throw new PolymarketValidationError(`Encoding not implemented for: ${functionName}`)
  }

  return selector + encoded
}

/**
 * Convert a human-readable amount to raw units (e.g., "10.5" with 6 decimals → "10500000").
 * Handles scientific notation (e.g., "1e6") by normalizing to decimal first.
 */
export function parseUnits(amount: string, decimals: number): string {
  if (!amount || isNaN(Number(amount))) {
    throw new PolymarketValidationError(`Invalid amount: ${amount}`)
  }
  // Normalize scientific notation to decimal string
  const normalized = Number(amount).toFixed(decimals + 2)
  const [whole = '0', frac = ''] = normalized.split('.')
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals)
  const raw = BigInt(whole + paddedFrac)
  return raw.toString()
}
