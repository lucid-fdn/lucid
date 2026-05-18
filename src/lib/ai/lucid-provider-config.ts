import 'server-only'

import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
} from '@/lib/ai/provider-policy'

export interface LucidProviderConfig {
  baseUrl: string
  apiKey?: string
  isConfigured: boolean
}

const DEFAULT_LUCID_BASE_URL = 'https://api.lucid.foundation'

export function getLucidProviderConfig(): LucidProviderConfig {
  const baseUrl =
    normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL) ??
    normalizeProviderBaseUrl(process.env.LUCID_API_BASE_URL) ??
    DEFAULT_LUCID_BASE_URL

  const apiKey =
    normalizeProviderSecret(process.env.TRUSTGATE_API_KEY) ??
    normalizeProviderSecret(process.env.LUCID_API_KEY)

  return {
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    isConfigured: Boolean(apiKey),
  }
}
