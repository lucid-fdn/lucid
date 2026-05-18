/**
 * Shared helpers for provider-first-with-fallback patterns in enhanced-tools.
 */

/**
 * Try primary provider if available, fall back to original on failure.
 */
export async function withFallback<T>(
  isAvailable: () => boolean,
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
): Promise<T> {
  if (isAvailable()) {
    try {
      return await primaryFn()
    } catch { /* fallback */ }
  }
  return fallbackFn()
}

/**
 * Run multiple provider calls in parallel, return object with only fulfilled results.
 * Takes array of [key, promise] pairs.
 */
export async function batchProviderCalls(
  calls: Array<[string, Promise<unknown>]>,
): Promise<Record<string, unknown>> {
  const settled = await Promise.allSettled(calls.map(([, p]) => p))
  const results: Record<string, unknown> = {}
  calls.forEach(([key], i) => {
    const r = settled[i]
    if (r.status === 'fulfilled' && r.value != null) results[key] = r.value
  })
  return results
}
