/**
 * Error hierarchy tests — verify error classification and retryability.
 */

import { describe, it, expect } from 'vitest'
import {
  PolymarketError,
  PolymarketAuthError,
  PolymarketRateLimitError,
  PolymarketApiError,
  PolymarketValidationError,
} from '../services/errors.js'

describe('PolymarketError hierarchy', () => {
  it('PolymarketError is instanceof Error', () => {
    const err = new PolymarketError('test', 'TEST', false)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('TEST')
    expect(err.retryable).toBe(false)
  })

  it('PolymarketAuthError is not retryable', () => {
    const err = new PolymarketAuthError('bad key')
    expect(err).toBeInstanceOf(PolymarketError)
    expect(err.code).toBe('AUTH_ERROR')
    expect(err.retryable).toBe(false)
  })

  it('PolymarketRateLimitError is retryable', () => {
    const err = new PolymarketRateLimitError('slow down', 5000)
    expect(err).toBeInstanceOf(PolymarketError)
    expect(err.code).toBe('RATE_LIMIT')
    expect(err.retryable).toBe(true)
    expect(err.retryAfterMs).toBe(5000)
  })

  it('PolymarketApiError: 500 is retryable, 400 is not', () => {
    const err500 = new PolymarketApiError('server error', 500, '/test')
    expect(err500.retryable).toBe(true)
    expect(err500.statusCode).toBe(500)

    const err400 = new PolymarketApiError('bad request', 400, '/test')
    expect(err400.retryable).toBe(false)

    const err429 = new PolymarketApiError('rate limit', 429, '/test')
    expect(err429.retryable).toBe(true)
  })

  it('PolymarketValidationError is not retryable', () => {
    const err = new PolymarketValidationError('bad input')
    expect(err).toBeInstanceOf(PolymarketError)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.retryable).toBe(false)
  })
})
