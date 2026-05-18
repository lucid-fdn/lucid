/**
 * Webhook Verify — Unit tests for HMAC primitives + parseSigHeader.
 */

import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('server-only', () => ({}))

const {
  hmacSha256,
  hmacSha256Base64,
  hmacSha1Base64,
  timingSafeEqual,
  parseSigHeader,
} = await import('../webhook-verify')

describe('hmacSha256', () => {
  it('matches the node reference hex output', () => {
    const expected = createHmac('sha256', 'secret').update('hello').digest('hex')
    expect(hmacSha256('secret', 'hello')).toBe(expected)
  })
})

describe('hmacSha256Base64', () => {
  it('matches the node reference base64 output', () => {
    const expected = createHmac('sha256', 'secret').update('payload').digest('base64')
    expect(hmacSha256Base64('secret', 'payload')).toBe(expected)
  })
})

describe('hmacSha1Base64', () => {
  it('matches the node reference sha1 base64 output (Trello)', () => {
    const expected = createHmac('sha1', 'secret').update('body').digest('base64')
    expect(hmacSha1Base64('secret', 'body')).toBe(expected)
  })
})

describe('timingSafeEqual', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different values of same length', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
  })

  it('returns false for different lengths (no throw)', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })

  it('returns false for non-string inputs', () => {
    // @ts-expect-error — runtime guard test
    expect(timingSafeEqual(null, 'abc')).toBe(false)
    // @ts-expect-error — runtime guard test
    expect(timingSafeEqual('abc', undefined)).toBe(false)
  })
})

describe('parseSigHeader', () => {
  it('returns null for empty/missing header', () => {
    expect(parseSigHeader(null)).toBeNull()
    expect(parseSigHeader(undefined)).toBeNull()
    expect(parseSigHeader('')).toBeNull()
  })

  it('returns the whole header when no = is present (plain hex)', () => {
    expect(parseSigHeader('abcdef0123')).toBe('abcdef0123')
  })

  it('parses GitHub-style sha256=<hex>', () => {
    expect(parseSigHeader('sha256=deadbeef', 'sha256')).toBe('deadbeef')
  })

  it('returns first value when no key specified', () => {
    expect(parseSigHeader('sha256=deadbeef,sha1=cafe')).toBe('deadbeef')
  })

  it('finds a specific key in comma-separated list', () => {
    expect(parseSigHeader('t=123,sha256=abc,sha1=xyz', 'sha1')).toBe('xyz')
  })

  it('returns null when requested key is missing', () => {
    expect(parseSigHeader('sha256=abc', 'sha1')).toBeNull()
  })
})
