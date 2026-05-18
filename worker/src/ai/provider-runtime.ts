export interface ProviderRuntimeState {
  isTemporarilyUnavailable(cacheKey: string): boolean
  markTemporarilyUnavailable(cacheKey: string): void
  clearUnavailable(cacheKey: string): void
}

export function buildProviderCacheKey(provider: string, baseUrl: string, model: string): string {
  return `${provider}:${baseUrl}:${model}`
}

export function createProviderRuntimeState(cooldownMs: number): ProviderRuntimeState {
  const unavailableProviderUntil = new Map<string, number>()

  return {
    isTemporarilyUnavailable(cacheKey: string): boolean {
      const expiresAt = unavailableProviderUntil.get(cacheKey)
      if (!expiresAt) return false
      if (expiresAt <= Date.now()) {
        unavailableProviderUntil.delete(cacheKey)
        return false
      }
      return true
    },
    markTemporarilyUnavailable(cacheKey: string): void {
      unavailableProviderUntil.set(cacheKey, Date.now() + cooldownMs)
    },
    clearUnavailable(cacheKey: string): void {
      unavailableProviderUntil.delete(cacheKey)
    },
  }
}
