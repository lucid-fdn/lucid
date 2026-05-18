/**
 * AI Provider Configuration
 *
 * Single unified endpoint: Lucid-L2 API (OpenAI-compatible)
 * Routes to 100+ models (Llama, Mistral, Qwen, DeepSeek, GPT, etc.)
 * Uses the official Lucid SDK's Vercel AI SDK provider for streaming.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { getLucidProviderConfig } from './lucid-provider-config';

// ============================================================================
// LUCID-L2 PROVIDER (OpenAI-compatible via @ai-sdk/openai)
// ============================================================================

const lucidProviderConfig = getLucidProviderConfig()

// Runtime hint map for cases where provider internals strip custom fields.
// Key: model id sent to upstream (e.g. 'llmproxy'), Value: passport id.
const modelPassportHints = new Map<string, string>();

/**
 * Lucid provider instance — uses @ai-sdk/openai with custom baseURL
 * since the Lucid-L2 API is OpenAI-compatible.
 */
export const lucid = createOpenAI({
  apiKey: lucidProviderConfig.apiKey || 'dummy-key',
  baseURL: `${lucidProviderConfig.baseUrl}/v1`,
});

type LucidPassportModelSettings = {
  modelPassportId?: string;
  modelMeta?: Record<string, unknown>;
};

type LucidPassportProvider = {
  (modelId: string, settings?: LucidPassportModelSettings): ReturnType<(typeof lucid)['chat']>;
  languageModel: (modelId: string, settings?: LucidPassportModelSettings) => ReturnType<(typeof lucid)['chat']>;
};

/**
 * Passport-aware provider wrapper for Vercel AI SDK usage.
 *
 * This keeps the OpenAI-compatible streaming transport, but enforces
 * deterministic model routing via `model_passport_id` when available.
 */
export function createLucidPassportProvider(): LucidPassportProvider {
  const createModel = (modelId: string, _settings?: LucidPassportModelSettings) => {
    // Extra body (model_passport_id, model_meta) will be passed at call time via
    // Vercel AI SDK's body option, not at provider creation.
    return lucid.chat(modelId);
  };

  const provider = ((modelId: string, settings?: LucidPassportModelSettings) => {
    return createModel(modelId, settings);
  }) as LucidPassportProvider;

  provider.languageModel = createModel;

  return provider;
}

export const lucidPassportProvider = createLucidPassportProvider();

/**
 * Get a model from Lucid-L2
 * @param modelId - Model identifier (e.g., 'meta-llama/Llama-3.3-70B-Instruct-Turbo')
 */
export function getLucidModel(
  modelId: string,
  options?: {
    modelPassportId?: string;
    modelMeta?: Record<string, unknown>;
  }
) {
  if (options?.modelPassportId) {
    modelPassportHints.set(modelId, options.modelPassportId);
  }

  // Backward-compatible helper; delegates to passport-aware provider.
  return lucidPassportProvider(modelId, {
    modelPassportId: options?.modelPassportId,
    modelMeta: options?.modelMeta,
  });
}

// ============================================================================
// PROVIDER CONFIGURATION (For UI/Documentation)
// ============================================================================

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  features: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    embeddings: boolean;
  };
}

export const LUCID_PROVIDER: ProviderInfo = {
  id: 'lucid',
  name: 'Lucid AI',
  description: 'Unified access to 100+ AI models via Lucid-L2 protocol',
  baseUrl: lucidProviderConfig.baseUrl,
  features: {
    streaming: true,
    functionCalling: true,
    vision: true,
    embeddings: true,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if the Lucid-L2 API is configured
 */
export function isLucidConfigured(): boolean {
  return lucidProviderConfig.isConfigured;
}

/**
 * Get the Lucid-L2 API base URL
 */
export function getLucidBaseUrl(): string {
  return lucidProviderConfig.baseUrl;
}

/**
 * Get provider info
 */
export function getProviderInfo(): ProviderInfo {
  return LUCID_PROVIDER;
}

// ============================================================================
// LEGACY COMPATIBILITY (For gradual migration)
// These exports maintain backward compatibility during transition
// ============================================================================

/** @deprecated Use lucid provider directly */
export type ProviderId = 'lucid';

/** @deprecated Use getLucidModel() instead */
export function getProvider(_providerId?: string) {
  return lucid;
}

/** @deprecated Use isLucidConfigured() instead */
export function getDefaultProvider(): string {
  return 'lucid';
}

/** @deprecated Use isLucidConfigured() instead */
export function isProviderEnabled(_providerId?: string): boolean {
  return isLucidConfigured();
}
