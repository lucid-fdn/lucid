/**
 * Contract tests — verify Polymarket constants match expected Polygon Mainnet values.
 * Catches accidental address changes or typos.
 */

import { describe, it, expect } from 'vitest'
import {
  POLYMARKET_CONTRACTS,
  POLYGON_CHAIN_ID,
  POLYMARKET_CLOB_URL,
  POLYMARKET_GAMMA_URL,
  ZERO_BYTES32,
  USDC_DECIMALS,
  BINARY_PARTITION,
  CLOB_API_KEY_CACHE_MAX,
  API_TIMEOUT_MS,
  MAX_RETRIES,
} from '../services/constants.js'

describe('Polymarket constants', () => {
  it('has correct Polygon chain ID', () => {
    expect(POLYGON_CHAIN_ID).toBe('137')
  })

  it('has all 5 contract addresses as valid checksummed hex', () => {
    const addresses = Object.values(POLYMARKET_CONTRACTS)
    expect(addresses).toHaveLength(5)
    for (const addr of addresses) {
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('USDC.e address matches known Polygon bridged USDC', () => {
    expect(POLYMARKET_CONTRACTS.USDC_E).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
  })

  it('CTF address matches known Gnosis CTF', () => {
    expect(POLYMARKET_CONTRACTS.CTF).toBe('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045')
  })

  it('API URLs are HTTPS', () => {
    expect(POLYMARKET_CLOB_URL).toMatch(/^https:\/\//)
    expect(POLYMARKET_GAMMA_URL).toMatch(/^https:\/\//)
  })

  it('ZERO_BYTES32 is 66 chars (0x + 64 hex)', () => {
    expect(ZERO_BYTES32).toHaveLength(66)
    expect(ZERO_BYTES32).toMatch(/^0x0{64}$/)
  })

  it('USDC decimals is 6', () => {
    expect(USDC_DECIMALS).toBe(6)
  })

  it('binary partition is [1, 2]', () => {
    expect([...BINARY_PARTITION]).toEqual([1, 2])
  })

  it('cache max is reasonable (100-10000)', () => {
    expect(CLOB_API_KEY_CACHE_MAX).toBeGreaterThanOrEqual(100)
    expect(CLOB_API_KEY_CACHE_MAX).toBeLessThanOrEqual(10000)
  })

  it('timeout is between 5s and 120s', () => {
    expect(API_TIMEOUT_MS).toBeGreaterThanOrEqual(5000)
    expect(API_TIMEOUT_MS).toBeLessThanOrEqual(120_000)
  })

  it('max retries is between 1 and 10', () => {
    expect(MAX_RETRIES).toBeGreaterThanOrEqual(1)
    expect(MAX_RETRIES).toBeLessThanOrEqual(10)
  })
})
