/**
 * Polymarket error hierarchy — structured errors for retry/logging decisions.
 */

export class PolymarketError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
  ) {
    super(message)
    this.name = 'PolymarketError'
  }
}

export class PolymarketAuthError extends PolymarketError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', false)
    this.name = 'PolymarketAuthError'
  }
}

export class PolymarketRateLimitError extends PolymarketError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message, 'RATE_LIMIT', true)
    this.name = 'PolymarketRateLimitError'
  }
}

export class PolymarketApiError extends PolymarketError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message, `API_ERROR_${statusCode}`, statusCode === 429 || statusCode >= 500)
    this.name = 'PolymarketApiError'
  }
}

export class PolymarketValidationError extends PolymarketError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', false)
    this.name = 'PolymarketValidationError'
  }
}
