import 'server-only'

import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  uniqueDefined,
} from '@/lib/ai/provider-policy'

export interface MediaProviderConfig {
  gatewayBaseUrls: string[]
  gatewayApiKeys: string[]
  preferredGatewayBaseUrl?: string
  preferredGatewayApiKey?: string
}

export function getMediaProviderConfig(): MediaProviderConfig {
  const gatewayBaseUrls = uniqueDefined([
    normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL),
    normalizeProviderBaseUrl(process.env.LUCID_API_BASE_URL),
    normalizeProviderBaseUrl(process.env.OPENAI_BASE_URL),
  ])

  const gatewayApiKeys = uniqueDefined([
    normalizeProviderSecret(process.env.TRUSTGATE_API_KEY),
    normalizeProviderSecret(process.env.MCPGATE_API_KEY),
    normalizeProviderSecret(process.env.LUCID_API_KEY),
    normalizeProviderSecret(process.env.OPENAI_API_KEY),
  ])

  return {
    gatewayBaseUrls,
    gatewayApiKeys,
    preferredGatewayBaseUrl: gatewayBaseUrls[0],
    preferredGatewayApiKey: gatewayApiKeys[0],
  }
}
