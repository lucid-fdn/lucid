import {
  isDirectOpenAIBaseUrl,
  isDirectOpenAIFallbackEnabled,
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
} from './provider-policy.js'

export interface WorkerLucidProviderConfig {
  baseUrl?: string
  apiKey?: string
  isConfigured: boolean
}

export interface WorkerLucidProviderInput {
  LUCID_API_BASE_URL?: string
  LUCID_API_KEY?: string
}

export function getWorkerLucidProviderConfig(config?: WorkerLucidProviderInput): WorkerLucidProviderConfig {
  const baseUrl =
    normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL) ??
    normalizeProviderBaseUrl(config?.LUCID_API_BASE_URL) ??
    normalizeProviderBaseUrl(process.env.LUCID_API_BASE_URL)

  const apiKey =
    normalizeProviderSecret(process.env.TRUSTGATE_API_KEY) ??
    normalizeProviderSecret(config?.LUCID_API_KEY) ??
    normalizeProviderSecret(process.env.LUCID_API_KEY)

  const directOpenAIBlocked = isDirectOpenAIBaseUrl(baseUrl) && !isDirectOpenAIFallbackEnabled()

  return {
    ...(baseUrl && !directOpenAIBlocked ? { baseUrl } : {}),
    ...(apiKey && !directOpenAIBlocked ? { apiKey } : {}),
    isConfigured: Boolean(baseUrl && apiKey && !directOpenAIBlocked),
  }
}

export function getWorkerLlmConfig(config?: WorkerLucidProviderInput): { baseUrl: string; apiKey: string } {
  const providerConfig = getWorkerLucidProviderConfig(config)
  if (!providerConfig.baseUrl || !providerConfig.apiKey) {
    const configuredBaseUrl =
      normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL) ??
      normalizeProviderBaseUrl(config?.LUCID_API_BASE_URL) ??
      normalizeProviderBaseUrl(process.env.LUCID_API_BASE_URL)

    if (isDirectOpenAIBaseUrl(configuredBaseUrl) && !isDirectOpenAIFallbackEnabled()) {
      throw new Error(
        'Direct OpenAI worker inference is disabled. Configure TRUSTGATE_BASE_URL/TRUSTGATE_API_KEY or enable AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED.',
      )
    }

    throw new Error('No worker AI inference provider is configured.')
  }

  return {
    baseUrl: providerConfig.baseUrl,
    apiKey: providerConfig.apiKey,
  }
}
