/**
 * Error Handling Wrappers
 * Reusable utilities for consistent error handling across layers
 */

import { ErrorService } from './error-service'
import type { ErrorContext, ErrorSeverity } from './types'

/**
 * Wrap database operations with standardized error handling
 * Returns null on error (standard database pattern)
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  context: {
    table: string
    operation: string
    [key: string]: unknown
  }
): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: context as ErrorContext,
      tags: {
        layer: 'database',
        table: context.table,
      },
    })
    return null
  }
}

/**
 * Wrap API route handlers with standardized error handling
 * Re-throws error for API route to handle response
 */
export async function withAPIErrorHandling<T>(
  operation: () => Promise<T>,
  context: {
    route: string
    method: string
    [key: string]: unknown
  }
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: context as ErrorContext,
      tags: {
        layer: 'api',
        route: context.route,
        method: context.method,
      },
    })
    throw error
  }
}

/**
 * Wrap server actions with standardized error handling
 * Returns ActionResult format
 */
export async function withServerActionErrorHandling<T>(
  operation: () => Promise<T>,
  context: {
    action: string
    [key: string]: unknown
  }
): Promise<{ success: true; data: T } | { success: false; error: string; code: string }> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: context as ErrorContext,
      tags: {
        layer: 'server-action',
        action: context.action,
      },
    })

    // Handle specific error types
    if (error instanceof Error) {
      // Zod validation errors
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Invalid input data',
          code: 'VALIDATION_ERROR',
        }
      }

      // Generic error with message
      return {
        success: false,
        error: error.message || 'Operation failed',
        code: 'INTERNAL_SERVER_ERROR',
      }
    }

    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    }
  }
}

/**
 * Wrap external API calls with error handling and retry logic
 * Useful for third-party integrations
 */
export async function withExternalAPIErrorHandling<T>(
  operation: () => Promise<T>,
  context: {
    service: string
    endpoint: string
    [key: string]: unknown
  },
  options?: {
    maxRetries?: number
    timeout?: number
  }
): Promise<T | null> {
  const maxRetries = options?.maxRetries || 3
  const timeout = options?.timeout || 30000

  let _lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )

      const result = await Promise.race([operation(), timeoutPromise])
      return result
    } catch (error) {
      _lastError = error

      ErrorService.captureException(error, {
        severity: attempt === maxRetries ? 'error' : 'warning',
        context: {
          ...context,
          attempt,
          maxRetries,
        } as ErrorContext,
        tags: {
          layer: 'external-api',
          service: context.service,
          endpoint: context.endpoint,
        },
      })

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  return null
}

/**
 * Create a tagged error handler for a specific context
 * Useful for consistent error handling in a module
 */
export function createErrorHandler(
  defaultContext: ErrorContext,
  defaultTags: Record<string, string> = {}
) {
  return {
    capture: (
      error: unknown,
      additionalContext?: ErrorContext,
      additionalTags?: Record<string, string>,
      severity: ErrorSeverity = 'error'
    ) => {
      ErrorService.captureException(error, {
        severity,
        context: { ...defaultContext, ...additionalContext },
        tags: { ...defaultTags, ...additionalTags },
      })
    },

    captureMessage: (
      message: string,
      additionalContext?: ErrorContext,
      additionalTags?: Record<string, string>,
      severity: ErrorSeverity = 'info'
    ) => {
      ErrorService.captureMessage(message, {
        severity,
        context: { ...defaultContext, ...additionalContext },
        tags: { ...defaultTags, ...additionalTags },
      })
    },
  }
}
