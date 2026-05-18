import 'server-only'

/**
 * BYOK Model Catalogs
 *
 * When an org has BYOK keys for a provider, these models become available
 * in model selectors. Assistant/runtime execution still routes through the
 * TrustGate policy path; legacy simple-chat flows may use the direct BYOK helper.
 *
 * Industry standard (Portkey, Vercel AI Playground):
 *   User adds API key → sees all that provider's models.
 */

import type { ProviderType } from '@/lib/db/provider-keys'
import { getConfiguredProviders } from '@/lib/db/provider-keys'
import type { ModelConfig } from './models'

// ============================================================================
// PROVIDER MODEL CATALOGS
// ============================================================================

interface CatalogEntry {
  id: string
  name: string
  category: 'chat' | 'code' | 'reasoning' | 'vision' | 'embedding'
  contextWindow: number
  maxOutputTokens: number
  pricing: { inputPerMillion: number; outputPerMillion: number }
  supportsVision?: boolean
  supportsFunctions?: boolean
}

const PROVIDER_CATALOGS: Partial<Record<ProviderType, { displayName: string; models: CatalogEntry[] }>> = {
  openai: {
    displayName: 'OpenAI',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 2, outputPerMillion: 8 }, supportsVision: true, supportsFunctions: true },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.4, outputPerMillion: 1.6 }, supportsVision: true, supportsFunctions: true },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 }, supportsVision: true, supportsFunctions: true },
      { id: 'gpt-4o', name: 'GPT-4o', category: 'chat', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 2.5, outputPerMillion: 10 }, supportsVision: true, supportsFunctions: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'chat', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, supportsVision: true, supportsFunctions: true },
      { id: 'o3', name: 'o3', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 2, outputPerMillion: 8 }, supportsFunctions: true },
      { id: 'o4-mini', name: 'o4 Mini', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 1.1, outputPerMillion: 4.4 }, supportsFunctions: true },
      { id: 'o3-mini', name: 'o3 Mini', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 1.1, outputPerMillion: 4.4 } },
    ],
  },

  anthropic: {
    displayName: 'Anthropic',
    models: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 32000, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, supportsVision: true, supportsFunctions: true },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', category: 'chat', contextWindow: 200000, maxOutputTokens: 64000, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', category: 'chat', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.8, outputPerMillion: 4 }, supportsFunctions: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', category: 'chat', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
    ],
  },

  google: {
    displayName: 'Google',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', category: 'reasoning', contextWindow: 1048576, maxOutputTokens: 65536, pricing: { inputPerMillion: 1.25, outputPerMillion: 10 }, supportsVision: true, supportsFunctions: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, supportsVision: true, supportsFunctions: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', category: 'chat', contextWindow: 1048576, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 }, supportsVision: true, supportsFunctions: true },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', category: 'chat', contextWindow: 1048576, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 }, supportsVision: true },
    ],
  },

  groq: {
    displayName: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', category: 'chat', contextWindow: 128000, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.59, outputPerMillion: 0.79 }, supportsFunctions: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', category: 'chat', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.05, outputPerMillion: 0.08 } },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', category: 'chat', contextWindow: 8192, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.2, outputPerMillion: 0.2 } },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', category: 'reasoning', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 0.75, outputPerMillion: 0.99 } },
    ],
  },

  mistral: {
    displayName: 'Mistral',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', category: 'chat', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 2, outputPerMillion: 6 }, supportsFunctions: true },
      { id: 'mistral-small-latest', name: 'Mistral Small', category: 'chat', contextWindow: 32000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.3 }, supportsFunctions: true },
      { id: 'codestral-latest', name: 'Codestral', category: 'code', contextWindow: 32000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.3, outputPerMillion: 0.9 } },
      { id: 'pixtral-large-latest', name: 'Pixtral Large', category: 'vision', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 2, outputPerMillion: 6 }, supportsVision: true },
    ],
  },

  deepseek: {
    displayName: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', category: 'chat', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.27, outputPerMillion: 1.1 }, supportsFunctions: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', category: 'reasoning', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19 } },
    ],
  },

  together: {
    displayName: 'Together AI',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', category: 'chat', contextWindow: 128000, maxOutputTokens: 4096, pricing: { inputPerMillion: 0.88, outputPerMillion: 0.88 }, supportsFunctions: true },
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B Turbo', category: 'chat', contextWindow: 128000, maxOutputTokens: 4096, pricing: { inputPerMillion: 3.5, outputPerMillion: 3.5 } },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', category: 'chat', contextWindow: 32768, maxOutputTokens: 4096, pricing: { inputPerMillion: 1.2, outputPerMillion: 1.2 } },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', category: 'reasoning', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 3.0, outputPerMillion: 7.0 } },
    ],
  },

  fireworks: {
    displayName: 'Fireworks AI',
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', category: 'chat', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 0.9, outputPerMillion: 0.9 } },
      { id: 'accounts/fireworks/models/deepseek-r1', name: 'DeepSeek R1', category: 'reasoning', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 2.0, outputPerMillion: 8.0 } },
    ],
  },

  perplexity: {
    displayName: 'Perplexity',
    models: [
      { id: 'sonar', name: 'Sonar', category: 'chat', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 1, outputPerMillion: 1 } },
      { id: 'sonar-pro', name: 'Sonar Pro', category: 'chat', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 3, outputPerMillion: 15 } },
      { id: 'sonar-reasoning', name: 'Sonar Reasoning', category: 'reasoning', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 1, outputPerMillion: 5 } },
    ],
  },

  openrouter: {
    displayName: 'OpenRouter',
    models: [
      // OpenRouter gives access to all models — user can type any model ID.
      // Showing a representative set here.
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4 (via OpenRouter)', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 32000, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, supportsVision: true },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (via OpenRouter)', category: 'chat', contextWindow: 200000, maxOutputTokens: 64000, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true },
      { id: 'openai/gpt-4.1', name: 'GPT-4.1 (via OpenRouter)', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 2, outputPerMillion: 8 }, supportsVision: true },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (via OpenRouter)', category: 'reasoning', contextWindow: 1048576, maxOutputTokens: 65536, pricing: { inputPerMillion: 1.25, outputPerMillion: 10 }, supportsVision: true },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)', category: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, supportsVision: true },
    ],
  },
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get BYOK models for an org based on their configured provider keys.
 * Returns ModelConfig[] with `source: 'byok'` in modelMeta.
 */
export async function getBYOKModels(orgId: string): Promise<ModelConfig[]> {
  const providers = await getConfiguredProviders(orgId)

  if (providers.length === 0) return []

  const models: ModelConfig[] = []

  for (const provider of providers) {
    const catalog = PROVIDER_CATALOGS[provider]
    if (!catalog) continue

    for (const entry of catalog.models) {
      models.push({
        id: entry.id,
        modelId: entry.id,
        name: entry.name,
        provider: catalog.displayName,
        category: entry.category,
        description: `Via your ${catalog.displayName} key`,
        contextWindow: entry.contextWindow,
        maxOutputTokens: entry.maxOutputTokens,
        pricing: entry.pricing,
        supportsFunctions: entry.supportsFunctions ?? false,
        supportsVision: entry.supportsVision ?? false,
        supportsStreaming: true,
        modelMeta: { source: 'byok', byokProvider: provider },
      })
    }
  }

  return models
}

/**
 * Get the display name for a BYOK provider.
 */
export function getBYOKProviderDisplayName(provider: ProviderType): string {
  return PROVIDER_CATALOGS[provider]?.displayName ?? provider
}
