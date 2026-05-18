import 'server-only'

/**
 * BYOK Provider — Create AI SDK providers using user's own API keys.
 *
 * When a user has configured BYOK provider keys, this module creates
 * provider instances that route directly to the provider (OpenAI, Anthropic, etc.)
 * using the user's decrypted key. Falls back to the default Lucid provider
 * if no BYOK key is available for the requested provider.
 *
 * Most providers use the OpenAI-compatible SDK adapter (Groq, Together,
 * Fireworks, DeepSeek, Mistral, Perplexity, OpenRouter) via `/v1/chat/completions`.
 *
 * Anthropic and Google use their native @ai-sdk packages for direct BYOK routing.
 * Only Cohere still falls back to the Lucid gateway.
 *
 * Architecture:
 *   User request → resolve provider (BYOK or Lucid) → route to provider API
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import {
  getDecryptedProviderKey,
  getDecryptedProviderKeysMap,
  type ProviderType,
} from '@/lib/db/provider-keys'
import { getLucidModel } from '@/lib/ai/providers'

// ============================================================================
// PROVIDER BASE URLS (OpenAI-compatible endpoints)
// ============================================================================

const PROVIDER_BASE_URLS: Partial<Record<ProviderType, string>> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  perplexity: 'https://api.perplexity.ai',
  openrouter: 'https://openrouter.ai/api/v1',
}

/**
 * Providers that expose an OpenAI-compatible chat/completions endpoint.
 * These can be used with createOpenAI({ baseURL }).
 */
const OPENAI_COMPATIBLE_PROVIDERS = new Set<ProviderType>([
  'openai',
  'groq',
  'mistral',
  'deepseek',
  'together',
  'fireworks',
  'perplexity',
  'openrouter',
])

/**
 * Providers that use native AI SDK adapters (not OpenAI-compatible).
 * Anthropic uses Messages API, Google uses Gemini API — both have
 * dedicated @ai-sdk packages for direct BYOK routing.
 */
const NATIVE_SDK_PROVIDERS = new Set<ProviderType>([
  'anthropic',
  'google',
])

/**
 * Providers that have no SDK adapter and must fall back to the Lucid
 * gateway. Only Cohere remains here — Anthropic and Google now use
 * their native SDKs.
 */
const NON_COMPATIBLE_PROVIDERS = new Set<ProviderType>([
  'cohere',
])

// ============================================================================
// MODEL → PROVIDER MAPPING
// ============================================================================

/**
 * Maps model ID prefixes to provider types.
 * Used to determine which BYOK key to use for a given model.
 */
const MODEL_PROVIDER_MAP: [string, ProviderType][] = [
  // OpenAI
  ['gpt-4', 'openai'],
  ['gpt-3.5', 'openai'],
  ['o1', 'openai'],
  ['o3', 'openai'],
  ['dall-e', 'openai'],
  ['text-embedding', 'openai'],
  ['chatgpt', 'openai'],

  // Anthropic
  ['claude', 'anthropic'],

  // Google
  ['gemini', 'google'],
  ['models/gemini', 'google'],

  // Mistral
  ['mistral', 'mistral'],
  ['open-mistral', 'mistral'],
  ['open-mixtral', 'mistral'],
  ['codestral', 'mistral'],
  ['pixtral', 'mistral'],

  // Groq (hosts open-source models)
  ['llama-3', 'groq'],
  ['llama3', 'groq'],
  ['mixtral-8x7b', 'groq'],
  ['gemma', 'groq'],

  // DeepSeek
  ['deepseek', 'deepseek'],

  // Together AI
  ['meta-llama/', 'together'],
  ['Qwen/', 'together'],
  ['NousResearch/', 'together'],
  ['togethercomputer/', 'together'],

  // Fireworks
  ['accounts/fireworks/', 'fireworks'],

  // Cohere
  ['command', 'cohere'],

  // Perplexity
  ['pplx-', 'perplexity'],
  ['sonar', 'perplexity'],
]

/**
 * Detect which provider a model belongs to based on its ID.
 */
export function detectProviderForModel(modelId: string): ProviderType | null {
  const lower = modelId.toLowerCase()
  for (const [prefix, provider] of MODEL_PROVIDER_MAP) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return provider
    }
  }
  return null
}

// ============================================================================
// BYOK PROVIDER FACTORY
// ============================================================================

/**
 * Create an OpenAI-compatible AI SDK provider using a user's own API key.
 * Only works for providers that expose /v1/chat/completions.
 */
function createBYOKOpenAIProvider(provider: ProviderType, apiKey: string) {
  const baseURL = PROVIDER_BASE_URLS[provider]
  if (!baseURL) {
    throw new Error(`No base URL configured for provider: ${provider}`)
  }

  return createOpenAI({
    apiKey,
    baseURL,
  })
}

/**
 * Create a native AI SDK provider for non-OpenAI-compatible providers.
 * Uses dedicated @ai-sdk packages (Anthropic, Google) for direct BYOK routing.
 */
function createNativeProvider(provider: ProviderType, apiKey: string, modelId: string) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey })
      return anthropic.chat(modelId)
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey })
      return google.chat(modelId)
    }
    default:
      throw new Error(`No native SDK adapter for provider: ${provider}`)
  }
}

// ============================================================================
// ENV-LEVEL API KEY FALLBACKS
// ============================================================================

/**
 * Maps provider types to environment variable names for API keys.
 * Used as fallback when no org-level BYOK key exists in the DB.
 * This enables self-hosted deployments to work with just env vars.
 */
const PROVIDER_ENV_KEYS: Partial<Record<ProviderType, string>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
}

/**
 * Get an API key from environment variables for a given provider.
 * Returns null if no env key is configured or it's empty.
 */
function getEnvProviderKey(provider: ProviderType): string | null {
  const envVar = PROVIDER_ENV_KEYS[provider]
  if (!envVar) return null
  const value = process.env[envVar]
  return value && value.trim() ? value.trim() : null
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface BYOKResult {
  /** Whether BYOK was used (true) or fell back to Lucid (false) */
  isBYOK: boolean
  /** The provider type used */
  provider: ProviderType | 'lucid'
  /** The language model instance for Vercel AI SDK */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any
}

/**
 * Get a language model, preferring BYOK if the org has a key for the provider.
 *
 * Usage:
 * ```ts
 * const { model, isBYOK } = await getBYOKModel(orgId, 'gpt-4o')
 * const result = await generateText({ model, prompt: '...' })
 * ```
 *
 * @param orgId - Organization ID to check for BYOK keys
 * @param modelId - Model identifier (e.g., 'gpt-4o', 'claude-3-opus')
 * @param options - Additional options for model creation
 */
export async function getBYOKModel(
  orgId: string,
  modelId: string,
  options?: {
    /** Force a specific provider instead of auto-detecting */
    forceProvider?: ProviderType
    /** Force Lucid routing (skip BYOK) */
    forceLucid?: boolean
  },
): Promise<BYOKResult> {
  // If forced to use Lucid, skip BYOK entirely
  if (options?.forceLucid) {
    return {
      isBYOK: false,
      provider: 'lucid',
      model: getLucidModel(modelId),
    }
  }

  // Detect which provider this model belongs to
  const detectedProvider =
    options?.forceProvider ?? detectProviderForModel(modelId)

  if (!detectedProvider) {
    // Unknown model → route through Lucid (it handles 100+ models)
    return {
      isBYOK: false,
      provider: 'lucid',
      model: getLucidModel(modelId),
    }
  }

  // Native SDK providers (Anthropic, Google) — use dedicated @ai-sdk packages
  if (NATIVE_SDK_PROVIDERS.has(detectedProvider)) {
    // Try org BYOK key first, then env-level key
    const decryptedKey = await getDecryptedProviderKey(orgId, detectedProvider)
    const apiKey = decryptedKey || getEnvProviderKey(detectedProvider)

    if (!apiKey) {
      return {
        isBYOK: false,
        provider: 'lucid',
        model: getLucidModel(modelId),
      }
    }

    try {
      return {
        isBYOK: true,
        provider: detectedProvider,
        model: createNativeProvider(detectedProvider, apiKey, modelId),
      }
    } catch {
      return {
        isBYOK: false,
        provider: 'lucid',
        model: getLucidModel(modelId),
      }
    }
  }

  // Non-compatible providers (Cohere) — fall back to Lucid gateway.
  if (NON_COMPATIBLE_PROVIDERS.has(detectedProvider)) {
    return {
      isBYOK: false,
      provider: 'lucid',
      model: getLucidModel(modelId),
    }
  }

  // Check if the org has a BYOK key, then env-level key
  const decryptedKey = await getDecryptedProviderKey(orgId, detectedProvider)
  const apiKey = decryptedKey || getEnvProviderKey(detectedProvider)

  if (!apiKey) {
    // No key anywhere → fall back to Lucid
    return {
      isBYOK: false,
      provider: 'lucid',
      model: getLucidModel(modelId),
    }
  }

  // Create a direct OpenAI-compatible provider with user's key
  try {
    const provider = createBYOKOpenAIProvider(detectedProvider, apiKey)
    return {
      isBYOK: true,
      provider: detectedProvider,
      model: provider.chat(modelId),
    }
  } catch {
    // If provider creation fails, fall back to Lucid
    return {
      isBYOK: false,
      provider: 'lucid',
      model: getLucidModel(modelId),
    }
  }
}

/**
 * Get all configured BYOK providers for an org.
 * Useful for showing which providers are available in the UI.
 */
export async function getBYOKProviders(
  orgId: string,
): Promise<ProviderType[]> {
  const keysMap = await getDecryptedProviderKeysMap(orgId)
  return Object.keys(keysMap) as ProviderType[]
}

/**
 * Check if an org has any BYOK keys configured.
 */
export async function hasBYOKKeys(orgId: string): Promise<boolean> {
  const providers = await getBYOKProviders(orgId)
  return providers.length > 0
}

/**
 * Check if a specific model can use BYOK (OpenAI-compatible endpoint).
 */
export function canUseBYOK(modelId: string): boolean {
  const provider = detectProviderForModel(modelId)
  if (!provider) return false
  return OPENAI_COMPATIBLE_PROVIDERS.has(provider) || NATIVE_SDK_PROVIDERS.has(provider)
}