import 'server-only'

import { ErrorService } from '@/lib/errors/error-service'

const DEFAULT_READ_FALLBACK_TIMEOUT_MS = 3_500

export async function withReadFallback<T>(
  operation: Promise<T>,
  fallback: T,
  context: Record<string, unknown>,
  timeoutMs = DEFAULT_READ_FALLBACK_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null

  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          ErrorService.addBreadcrumb(
            'read-fallback',
            `Read fallback timed out after ${timeoutMs}ms`,
            context,
            'warning',
          )
          resolve(fallback)
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context,
      tags: { layer: 'api', mode: 'read-fallback' },
    })
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}
