/**
 * PM Sync Errors — Unit tests for the typed error hierarchy.
 */

import { describe, it, expect } from 'vitest'
import {
  PmSyncError,
  PmSyncMappingError,
  PmSyncAuthError,
  PmSyncRateLimitError,
} from '../errors'

describe('PmSyncError', () => {
  it('defaults retryable=true with no provider', () => {
    const err = new PmSyncError('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
    expect(err.retryable).toBe(true)
    expect(err.provider).toBeNull()
    expect(err.name).toBe('PmSyncError')
  })

  it('captures provider + cause + retryable override', () => {
    const cause = new Error('inner')
    const err = new PmSyncError('boom', { provider: 'linear', retryable: false, cause })
    expect(err.provider).toBe('linear')
    expect(err.retryable).toBe(false)
    expect(err.cause).toBe(cause)
  })
})

describe('PmSyncMappingError', () => {
  it('is permanent (retryable=false)', () => {
    const err = new PmSyncMappingError('missing team id', { provider: 'linear' })
    expect(err).toBeInstanceOf(PmSyncError)
    expect(err.retryable).toBe(false)
    expect(err.name).toBe('PmSyncMappingError')
    expect(err.provider).toBe('linear')
  })
})

describe('PmSyncAuthError', () => {
  it('is permanent (retryable=false)', () => {
    const err = new PmSyncAuthError('revoked', { provider: 'asana' })
    expect(err).toBeInstanceOf(PmSyncError)
    expect(err.retryable).toBe(false)
    expect(err.name).toBe('PmSyncAuthError')
  })
})

describe('PmSyncRateLimitError', () => {
  it('is retryable and carries retryAfterMs', () => {
    const err = new PmSyncRateLimitError('throttled', {
      provider: 'trello',
      retryAfterMs: 15_000,
    })
    expect(err).toBeInstanceOf(PmSyncError)
    expect(err.retryable).toBe(true)
    expect(err.retryAfterMs).toBe(15_000)
  })

  it('defaults retryAfterMs to 30s', () => {
    const err = new PmSyncRateLimitError('throttled')
    expect(err.retryAfterMs).toBe(30_000)
  })
})
