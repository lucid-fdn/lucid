import 'server-only'

import { getL2AdminApiKeyFromEnv } from './env'

export function getL2AdminApiKey(): string | null {
  return getL2AdminApiKeyFromEnv()
}

export function getL2AdminAuthHeaders(): Record<string, string> {
  const key = getL2AdminApiKey()
  return key ? { Authorization: `Bearer ${key}` } : {}
}
