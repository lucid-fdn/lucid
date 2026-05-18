/**
 * Error Management Types
 * Standardized error classes and types for the application
 */

export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DATABASE_ERROR'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PAYMENT_FAILED'
  | 'EXTERNAL_API_ERROR'
  | 'INTERNAL_SERVER_ERROR'
  | 'UNKNOWN_ERROR'

export interface ErrorContext {
  userId?: string
  organizationId?: string
  projectId?: string
  environmentId?: string
  route?: string
  action?: string
  component?: string
  [key: string]: unknown
}

/**
 * Base API Error class
 * Use this for expected errors that should be handled gracefully
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: ErrorCode = 'INTERNAL_SERVER_ERROR',
    public severity: ErrorSeverity = 'error',
    public context?: ErrorContext
  ) {
    super(message)
    this.name = 'APIError'
    Object.setPrototypeOf(this, APIError.prototype)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      status: 'error',
      ...(process.env.NODE_ENV === 'development' && {
        details: this.context
      })
    }
  }
}

/**
 * Validation Error
 * For invalid user input
 */
export class ValidationError extends APIError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 400, 'VALIDATION_ERROR', 'warning', context)
    this.name = 'ValidationError'
  }
}

/**
 * Authentication Error
 * For unauthorized access
 */
export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication required', context?: ErrorContext) {
    super(message, 401, 'UNAUTHORIZED', 'warning', context)
    this.name = 'AuthenticationError'
  }
}

/**
 * Authorization Error
 * For forbidden access
 */
export class AuthorizationError extends APIError {
  constructor(message: string = 'Insufficient permissions', context?: ErrorContext) {
    super(message, 403, 'FORBIDDEN', 'warning', context)
    this.name = 'AuthorizationError'
  }
}

/**
 * Not Found Error
 * For missing resources
 */
export class NotFoundError extends APIError {
  constructor(message: string = 'Resource not found', context?: ErrorContext) {
    super(message, 404, 'NOT_FOUND', 'info', context)
    this.name = 'NotFoundError'
  }
}

/**
 * Database Error
 * For database operation failures
 */
export class DatabaseError extends APIError {
  constructor(message: string = 'Database operation failed', context?: ErrorContext) {
    super(message, 500, 'DATABASE_ERROR', 'error', context)
    this.name = 'DatabaseError'
  }
}

/**
 * Network Error
 * For external API failures
 */
export class NetworkError extends APIError {
  constructor(message: string = 'Network request failed', context?: ErrorContext) {
    super(message, 503, 'NETWORK_ERROR', 'error', context)
    this.name = 'NetworkError'
  }
}

/**
 * Rate Limit Error
 * For rate limiting
 */
export class RateLimitError extends APIError {
  constructor(message: string = 'Rate limit exceeded', context?: ErrorContext) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', 'warning', context)
    this.name = 'RateLimitError'
  }
}

/**
 * Payment Error
 * For payment processing failures
 */
export class PaymentError extends APIError {
  constructor(message: string = 'Payment processing failed', context?: ErrorContext) {
    super(message, 402, 'PAYMENT_FAILED', 'error', context)
    this.name = 'PaymentError'
  }
}

/**
 * Action Result type for Server Actions
 * Standardized response format
 */
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string; code?: ErrorCode }

/**
 * API Response type for API Routes
 * Standardized response format
 */
export type APIResponse<T = unknown> =
  | { data: T; status: 'success' }
  | { error: string; code: ErrorCode; status: 'error'; details?: Record<string, unknown> }
