/**
 * Centralized Error Service
 * Handles error capture, logging, and reporting to Sentry
 */

import * as Sentry from '@sentry/nextjs'
import type { ErrorSeverity, ErrorContext, APIError } from './types'
import { redactLogMetadata, redactLogText } from '@/lib/logging/safe-log'

function errorMessage(error: Error | unknown): string {
  if (error instanceof Error) return redactLogText(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return redactLogText(String((error as { message: unknown }).message))
  }
  return redactLogText(String(error))
}

function sanitizeErrorForReporting(error: Error | unknown): Error {
  if (error instanceof Error) {
    const sanitized = new Error(redactLogText(error.message))
    sanitized.name = error.name
    if (error.stack) sanitized.stack = redactLogText(error.stack)
    return sanitized
  }

  return new Error(errorMessage(error))
}

function sanitizeContext(context?: ErrorContext): ErrorContext | undefined {
  return redactLogMetadata(context)
}

function sanitizeTags(tags?: Record<string, string>): Record<string, string> | undefined {
  if (!tags) return undefined
  const redacted = redactLogMetadata(tags)
  return Object.fromEntries(
    Object.entries(redacted).map(([key, value]) => [key, String(value)]),
  )
}

/**
 * Error Service
 * Use this instead of console.error throughout the app
 */
export class ErrorService {
  /**
   * Initialize the error service
   * Called automatically by Sentry config files
   */
  static init() {
    // Sentry is initialized in sentry.*.config.ts files
    // This method exists for any additional setup needed
  }

  /**
   * Capture an exception and send to Sentry
   * @param error - The error to capture
   * @param options - Additional options
   */
  static captureException(
    error: Error | unknown,
    options?: {
      severity?: ErrorSeverity
      context?: ErrorContext
      tags?: Record<string, string>
      fingerprint?: string[]
    }
  ) {
    const severity = options?.severity || 'error'

    const errorMsg = errorMessage(error)
    const context = sanitizeContext(options?.context)
    const tags = sanitizeTags(options?.tags)
    const sentryError = sanitizeErrorForReporting(error)

    // Log locally (always)
    if (severity === 'fatal' || severity === 'error') {
      console.error(`[ErrorService] ${errorMsg}`, context)
    } else if (severity === 'warning') {
      console.warn(`[ErrorService] ${errorMsg}`, context)
    } else {
      console.log(`[ErrorService][${severity}] ${errorMsg}`, context)
    }

    // Send to Sentry (only in production or when DSN is configured)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.withScope((scope) => {
        // Set severity
        scope.setLevel(this.mapSeverity(severity))

        // Set context
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setContext(key, { value })
          })
        }

        // Set tags
        if (tags) {
          Object.entries(tags).forEach(([key, value]) => {
            scope.setTag(key, value)
          })
        }

        // Set fingerprint (for grouping)
        if (options?.fingerprint) {
          scope.setFingerprint(options.fingerprint)
        }

        // Extract additional info from APIError
        if (this.isAPIError(error)) {
          scope.setTag('error_code', error.code)
          scope.setTag('status_code', error.statusCode.toString())
          const apiErrorContext = sanitizeContext(error.context)
          if (apiErrorContext) {
            Object.entries(apiErrorContext).forEach(([key, value]) => {
              scope.setContext('api_error_context', { [key]: value })
            })
          }
        }

        // Capture the exception
        Sentry.captureException(sentryError)
      })
    }
  }

  /**
   * Capture a message (not an error)
   * @param message - The message to capture
   * @param options - Additional options
   */
  static captureMessage(
    message: string,
    options?: {
      severity?: ErrorSeverity
      context?: ErrorContext
      tags?: Record<string, string>
    }
  ) {
    const severity = options?.severity || 'info'
    const safeMessage = redactLogText(message)
    const context = sanitizeContext(options?.context)
    const tags = sanitizeTags(options?.tags)

    // Log locally
    console.log(`[ErrorService][${severity}]`, safeMessage, context)

    // Send to Sentry
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setLevel(this.mapSeverity(severity))

        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setContext(key, { value })
          })
        }

        if (tags) {
          Object.entries(tags).forEach(([key, value]) => {
            scope.setTag(key, value)
          })
        }

        Sentry.captureMessage(safeMessage)
      })
    }
  }

  /**
   * Set user context for error tracking
   * Call this after user authentication
   */
  static setUser(user: {
    id: string
    email?: string
    username?: string
    [key: string]: unknown
  }) {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.username,
      })
    }
  }

  /**
   * Clear user context
   * Call this on logout
   */
  static clearUser() {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setUser(null)
    }
  }

  /**
   * Add breadcrumb (user action before error)
   * Helps debug what led to the error
   */
  static addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
    level?: ErrorSeverity
  ) {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category,
        message: redactLogText(message),
        data: redactLogMetadata(data),
        level: this.mapSeverity(level || 'info'),
      })
    }
  }

  /**
   * Set custom tag for filtering in Sentry
   */
  static setTag(key: string, value: string) {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setTag(key, value)
    }
  }

  /**
   * Set custom context for additional info
   */
  static setContext(key: string, value: Record<string, unknown>) {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setContext(key, redactLogMetadata(value))
    }
  }

  /**
   * Start a span for performance monitoring
   * Note: Use Sentry's automatic instrumentation for most cases
   */
  static startSpan<T>(
    name: string,
    op: string,
    callback: () => T
  ): T {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return Sentry.startSpan({ name, op }, callback)
    }
    return callback()
  }

  /**
   * Check if error is an APIError instance
   */
  private static isAPIError(error: unknown): error is APIError {
    return (
      error instanceof Error &&
      'statusCode' in error &&
      'code' in error &&
      'severity' in error
    )
  }

  /**
   * Map our severity levels to Sentry levels
   */
  private static mapSeverity(severity: ErrorSeverity): Sentry.SeverityLevel {
    const map: Record<ErrorSeverity, Sentry.SeverityLevel> = {
      fatal: 'fatal',
      error: 'error',
      warning: 'warning',
      info: 'info',
      debug: 'debug',
    }
    return map[severity]
  }
}

/**
 * Utility function to wrap async functions with error handling
 * Automatically catches and reports errors
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: {
    context?: ErrorContext
    fallback?: T
    rethrow?: boolean
  }
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: options?.context,
    })
    
    if (options?.rethrow) {
      throw error
    }
    
    return options?.fallback
  }
}

/**
 * Utility function for retry logic with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number
    delay?: number
    backoff?: number
    context?: ErrorContext
  }
): Promise<T> {
  const maxRetries = options?.maxRetries || 3
  const delay = options?.delay || 1000
  const backoff = options?.backoff || 2

  let lastError: Error | unknown

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (i === maxRetries - 1) {
        // Last retry failed
        ErrorService.captureException(error, {
          severity: 'error',
          context: {
            ...options?.context,
            retries: i + 1,
            maxRetries,
          },
        })
        throw error
      }

      // Wait before retrying (exponential backoff)
      const waitTime = delay * Math.pow(backoff, i)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      
      ErrorService.addBreadcrumb(
        'retry',
        `Retrying after ${waitTime}ms (attempt ${i + 1}/${maxRetries})`,
        { error: String(error) },
        'info'
      )
    }
  }

  throw lastError
}
