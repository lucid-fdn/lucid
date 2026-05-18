import { normalizeProviderBaseUrl, normalizeProviderSecret, uniqueDefined } from './provider-policy.js'
import { getWorkerLucidProviderConfig, type WorkerLucidProviderInput } from './lucid-provider-config.js'

export interface WorkerMediaGatewayEndpoint {
  baseUrl: string
  apiKey: string
}

export interface WorkerMediaProviderConfig {
  gatewayEndpoints: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls: string[]
  gatewayApiKeys: string[]
  preferredGatewayBaseUrl?: string
  preferredGatewayApiKey?: string
}

export function getWorkerMediaProviderConfig(config?: WorkerLucidProviderInput): WorkerMediaProviderConfig {
  const lucidProviderConfig = getWorkerLucidProviderConfig(config)

  const gatewayBaseUrls = uniqueDefined([
    normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL),
    lucidProviderConfig.isConfigured ? lucidProviderConfig.baseUrl : undefined,
  ])

  const gatewayApiKeys = uniqueDefined([
    normalizeProviderSecret(process.env.TRUSTGATE_API_KEY),
    normalizeProviderSecret(process.env.MCPGATE_API_KEY),
    lucidProviderConfig.isConfigured ? lucidProviderConfig.apiKey : undefined,
  ])

  const gatewayEndpoints = gatewayBaseUrls.flatMap((baseUrl) =>
    gatewayApiKeys.map((apiKey) => ({ baseUrl, apiKey })),
  )

  return {
    gatewayEndpoints,
    gatewayBaseUrls,
    gatewayApiKeys,
    ...(gatewayEndpoints[0] ? { preferredGatewayBaseUrl: gatewayEndpoints[0].baseUrl } : {}),
    ...(gatewayEndpoints[0] ? { preferredGatewayApiKey: gatewayEndpoints[0].apiKey } : {}),
  }
}
