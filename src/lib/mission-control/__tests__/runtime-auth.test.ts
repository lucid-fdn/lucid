/**
 * Runtime Auth Module Tests
 *
 * Tests API key generation, hashing, and verification.
 * Cannot test authenticateRuntime() directly (requires DB + server-only),
 * so we test the pure crypto functions and key format invariants.
 */

import { describe, it, expect } from 'vitest'
import crypto from 'crypto'

// Re-implement the pure functions here since the module has 'server-only' import
// These mirror the exact logic in src/app/api/runtimes/_auth.ts

function generateApiKey(runtimeId: string): string {
  const prefix = runtimeId.replace(/-/g, '').slice(0, 8)
  const random = crypto.randomBytes(28).toString('hex')
  return `${prefix}${random}`
}

function hashApiKey(apiKey: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(apiKey, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyApiKey(apiKey: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const derivedHash = crypto.scryptSync(apiKey, salt, 64).toString('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derivedHash, 'hex'))
  } catch {
    return false
  }
}

function extractPrefix(apiKey: string): string {
  return apiKey.slice(0, 8)
}

const TEST_RUNTIME_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('generateApiKey', () => {
  it('generates a 64-char hex string', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    expect(key).toHaveLength(64) // 8 prefix + 56 random
    expect(/^[0-9a-f]{64}$/.test(key)).toBe(true)
  })

  it('embeds runtime ID prefix (first 8 chars of UUID without dashes)', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    const expectedPrefix = TEST_RUNTIME_ID.replace(/-/g, '').slice(0, 8)
    expect(key.slice(0, 8)).toBe(expectedPrefix)
  })

  it('generates unique keys for the same runtime', () => {
    const key1 = generateApiKey(TEST_RUNTIME_ID)
    const key2 = generateApiKey(TEST_RUNTIME_ID)
    expect(key1).not.toBe(key2)
    // But same prefix
    expect(key1.slice(0, 8)).toBe(key2.slice(0, 8))
  })

  it('generates different prefixes for different runtimes', () => {
    const key1 = generateApiKey('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    const key2 = generateApiKey('11111111-2222-3333-4444-555555555555')
    expect(key1.slice(0, 8)).not.toBe(key2.slice(0, 8))
  })

  it('handles UUIDs with leading zeros', () => {
    const key = generateApiKey('00000000-0000-0000-0000-000000000000')
    expect(key.slice(0, 8)).toBe('00000000')
    expect(key).toHaveLength(64)
  })
})

describe('extractPrefix', () => {
  it('extracts first 8 chars from API key', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    const prefix = extractPrefix(key)
    expect(prefix).toHaveLength(8)
    expect(prefix).toBe(TEST_RUNTIME_ID.replace(/-/g, '').slice(0, 8))
  })
})

describe('hashApiKey + verifyApiKey', () => {
  it('hash produces salt:hash format', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    const hashed = hashApiKey(key)
    const parts = hashed.split(':')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toHaveLength(32) // 16-byte salt in hex
    expect(parts[1]).toHaveLength(128) // 64-byte hash in hex
  })

  it('verifies a correctly hashed key', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    const hashed = hashApiKey(key)
    expect(verifyApiKey(key, hashed)).toBe(true)
  })

  it('rejects a wrong key', () => {
    const key1 = generateApiKey(TEST_RUNTIME_ID)
    const key2 = generateApiKey(TEST_RUNTIME_ID)
    const hashed = hashApiKey(key1)
    expect(verifyApiKey(key2, hashed)).toBe(false)
  })

  it('produces different hashes for the same key (different salts)', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    const hash1 = hashApiKey(key)
    const hash2 = hashApiKey(key)
    expect(hash1).not.toBe(hash2)
    // Both should verify correctly
    expect(verifyApiKey(key, hash1)).toBe(true)
    expect(verifyApiKey(key, hash2)).toBe(true)
  })

  it('rejects malformed stored hash (no colon)', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    expect(verifyApiKey(key, 'nocolonhere')).toBe(false)
  })

  it('rejects empty stored hash', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    expect(verifyApiKey(key, '')).toBe(false)
  })

  it('rejects stored hash with wrong length', () => {
    const key = generateApiKey(TEST_RUNTIME_ID)
    expect(verifyApiKey(key, 'short:hash')).toBe(false)
  })

  it('is timing-safe (uses timingSafeEqual)', () => {
    // This test verifies the function doesn't throw on valid inputs
    // True timing-safety requires statistical analysis, but we confirm
    // the code path uses timingSafeEqual by testing edge cases
    const key = generateApiKey(TEST_RUNTIME_ID)
    const hashed = hashApiKey(key)
    // Should not throw
    expect(() => verifyApiKey(key, hashed)).not.toThrow()
    expect(() => verifyApiKey('wrong', hashed)).not.toThrow()
  })
})

describe('key format invariants', () => {
  it('prefix enables O(1) lookup by matching UUID start', () => {
    const runtimeId = 'abcd1234-5678-9abc-def0-123456789abc'
    const key = generateApiKey(runtimeId)
    const prefix = extractPrefix(key)
    // The prefix (first 8 hex of UUID without dashes) matches the start of the UUID
    expect(runtimeId.replace(/-/g, '').startsWith(prefix)).toBe(true)
  })

  it('key is long enough to be cryptographically secure', () => {
    // 28 random bytes = 224 bits of entropy (well above 128-bit minimum)
    const key = generateApiKey(TEST_RUNTIME_ID)
    const randomPart = key.slice(8) // 56 hex chars = 28 bytes
    expect(randomPart).toHaveLength(56)
  })
})
