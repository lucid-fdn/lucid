/**
 * Unit tests for Polymarket ABI encoding utilities.
 * Verifies calldata encoding against known-good values.
 */

import { describe, it, expect } from 'vitest'
import { encodeFunctionData, parseUnits } from '../services/abi-utils.js'

// ============================================================================
// parseUnits
// ============================================================================

describe('parseUnits', () => {
  it('converts whole numbers', () => {
    expect(parseUnits('100', 6)).toBe('100000000')
    expect(parseUnits('1', 6)).toBe('1000000')
    expect(parseUnits('0', 6)).toBe('0')
  })

  it('converts fractional amounts', () => {
    expect(parseUnits('10.5', 6)).toBe('10500000')
    expect(parseUnits('0.000001', 6)).toBe('1')
    expect(parseUnits('1.123456', 6)).toBe('1123456')
  })

  it('truncates extra decimals', () => {
    expect(parseUnits('1.1234567', 6)).toBe('1123456')
    expect(parseUnits('0.00000099', 6)).toBe('0')
  })

  it('handles different decimal places', () => {
    expect(parseUnits('1.5', 18)).toBe('1500000000000000000')
    expect(parseUnits('1', 0)).toBe('1')
  })

  it('throws on invalid input', () => {
    expect(() => parseUnits('', 6)).toThrow('Invalid amount')
    expect(() => parseUnits('abc', 6)).toThrow('Invalid amount')
  })
})

// ============================================================================
// encodeFunctionData — selectors
// ============================================================================

describe('encodeFunctionData selectors', () => {
  it('approve selector is 0x095ea7b3', () => {
    const data = encodeFunctionData('approve', [
      '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
      '1000000',
    ])
    expect(data.startsWith('0x095ea7b3')).toBe(true)
  })

  it('setApprovalForAll selector is 0xa22cb465', () => {
    const data = encodeFunctionData('setApprovalForAll', [
      '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
      true,
    ])
    expect(data.startsWith('0xa22cb465')).toBe(true)
  })

  it('splitPosition selector is 0x72ce4275', () => {
    const data = encodeFunctionData('splitPosition', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      [1, 2],
      '100000000',
    ])
    expect(data.startsWith('0x72ce4275')).toBe(true)
  })

  it('mergePositions selector is 0x5d03c2fe', () => {
    const data = encodeFunctionData('mergePositions', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      [1, 2],
      '100000000',
    ])
    expect(data.startsWith('0x5d03c2fe')).toBe(true)
  })

  it('throws on unknown function', () => {
    expect(() => encodeFunctionData('notAFunction', [])).toThrow('Unknown function')
  })
})

// ============================================================================
// encodeFunctionData — encoding correctness
// ============================================================================

describe('encodeFunctionData encoding', () => {
  it('encodes approve(address, uint256) correctly', () => {
    const data = encodeFunctionData('approve', [
      '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
      '1000000',
    ])
    // selector (4 bytes) + address (32 bytes) + uint256 (32 bytes) = 68 bytes = 138 hex chars with 0x
    expect(data.length).toBe(2 + 8 + 64 + 64)

    // address should be zero-padded to 32 bytes (case-insensitive — preserves original case)
    const addressPart = data.slice(10, 10 + 64).toLowerCase()
    expect(addressPart).toContain('4d97dcd97ec945f40cf65f87097ace5ea0476045')
  })

  it('encodes setApprovalForAll(address, bool) with true', () => {
    const data = encodeFunctionData('setApprovalForAll', [
      '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
      true,
    ])
    const boolPart = data.slice(-64)
    expect(boolPart).toBe('0000000000000000000000000000000000000000000000000000000000000001')
  })

  it('encodes setApprovalForAll(address, bool) with false', () => {
    const data = encodeFunctionData('setApprovalForAll', [
      '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
      false,
    ])
    const boolPart = data.slice(-64)
    expect(boolPart).toBe('0000000000000000000000000000000000000000000000000000000000000000')
  })

  it('encodes splitPosition with dynamic array — has correct structure', () => {
    const data = encodeFunctionData('splitPosition', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // collateral
      '0x0000000000000000000000000000000000000000000000000000000000000000', // parentCollectionId
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // conditionId
      [1, 2], // partition
      '100000000', // amount
    ])

    // Structure: selector(8) + address(64) + bytes32(64) + bytes32(64) + offset(64) + amount(64) + arrLen(64) + el1(64) + el2(64)
    // = 8 + 8*64 = 520 hex chars + 2 for "0x" = 522
    expect(data.length).toBe(522)
    expect(data.startsWith('0x72ce4275')).toBe(true)
  })

  it('amount encodes to correct uint256', () => {
    const data = encodeFunctionData('approve', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '1000000', // 1 USDC
    ])
    // Last 64 chars = uint256 of 1000000 = 0xF4240
    const amountPart = data.slice(-64)
    expect(amountPart).toBe('00000000000000000000000000000000000000000000000000000000000f4240')
  })
})

// ============================================================================
// Input validation
// ============================================================================

describe('input validation', () => {
  it('rejects invalid addresses', () => {
    expect(() => encodeFunctionData('approve', ['notanaddress', '1000'])).toThrow('Invalid address')
    expect(() => encodeFunctionData('approve', ['0x123', '1000'])).toThrow('Invalid address')
  })

  it('rejects invalid bytes32', () => {
    expect(() => encodeFunctionData('splitPosition', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '0x123', // too short
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      [1, 2],
      '100',
    ])).toThrow('Invalid bytes32')
  })

  it('rejects negative uint256', () => {
    expect(() => encodeFunctionData('approve', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '-1',
    ])).toThrow('uint256 cannot be negative')
  })

  it('rejects empty partition array', () => {
    expect(() => encodeFunctionData('splitPosition', [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      [],
      '100',
    ])).toThrow('partition must be a non-empty array')
  })
})
