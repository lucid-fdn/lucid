/**
 * AI Model Registry
 *
 * Fetches models from TrustGate (LiteLLM catalog) — the single source of truth
 * for all models available through the Lucid platform.
 * Enriches with static metadata (pricing, capabilities) from GATEWAY_MODEL_META.
 */

// ============================================================================
// TRUSTGATE CONFIG
// ============================================================================

const TRUSTGATE_BASE_URL = process.env.TRUSTGATE_BASE_URL || '';

// ============================================================================
// DEFAULTS
// ============================================================================

/** Default model used across the platform when no model is specified */
export const DEFAULT_MODEL_ID = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

// ============================================================================
// MODEL TYPES
// ============================================================================

export type ModelCategory = 'chat' | 'code' | 'reasoning' | 'vision' | 'embedding';

export interface ModelPricing {
  inputPerMillion: number;  // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
}

export interface ModelConfig {
  id: string;                    // Backward-compatible alias for modelId
  modelId: string;               // OpenAI-compatible chat model ID (use with Vercel AI SDK)
  passportId?: string;           // Lucid passport ID (use with lucidSDK.run.inference)
  name: string;                  // Human-readable name
  provider: string;              // Provider info (for grouping in UI)
  category: ModelCategory;       // Primary use case
  description: string;           // Short description
  contextWindow: number;         // Max context in tokens
  maxOutputTokens: number;       // Max output in tokens
  pricing: ModelPricing;         // Cost per million tokens
  isDefault?: boolean;           // Default model for category
  isNew?: boolean;               // Recently added
  isFeatured?: boolean;          // Featured/recommended
  supportsFunctions?: boolean;   // Function/tool calling
  supportsVision?: boolean;      // Image input
  supportsStreaming?: boolean;   // Streaming responses
  modelMeta?: Record<string, unknown>; // Raw model metadata for provider-specific routing
}

// ============================================================================
// MODEL CACHE
// ============================================================================

let modelsCache: ModelConfig[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// TRUSTGATE MODEL METADATA ENRICHMENT
// ============================================================================

/**
 * Static metadata for models available through TrustGate/LiteLLM.
 * Provides pricing, context window, and capabilities for known models.
 * Models not in this map get sensible defaults.
 */
interface GatewayModelMeta {
  name: string;
  category: ModelCategory;
  contextWindow: number;
  maxOutputTokens: number;
  pricing: ModelPricing;
  supportsVision?: boolean;
  supportsFunctions?: boolean;
}

const GATEWAY_MODEL_META: Record<string, GatewayModelMeta> = {
  // OpenAI
  'openai/gpt-4.1': { name: 'GPT-4.1', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 2, outputPerMillion: 8 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-4.1-mini': { name: 'GPT-4.1 Mini', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.4, outputPerMillion: 1.6 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-4.1-nano': { name: 'GPT-4.1 Nano', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-4o': { name: 'GPT-4o', category: 'chat', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 2.5, outputPerMillion: 10 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-4o-mini': { name: 'GPT-4o Mini', category: 'chat', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, supportsVision: true, supportsFunctions: true },
  'openai/o3': { name: 'o3', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 2, outputPerMillion: 8 }, supportsFunctions: true },
  'openai/o4-mini': { name: 'o4 Mini', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 1.1, outputPerMillion: 4.4 }, supportsFunctions: true },
  'openai/o3-mini': { name: 'o3 Mini', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 1.1, outputPerMillion: 4.4 } },
  'openai/gpt-5': { name: 'GPT-5', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 5, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5-mini': { name: 'GPT-5 Mini', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 1, outputPerMillion: 4 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5-nano': { name: 'GPT-5 Nano', category: 'chat', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.2, outputPerMillion: 0.8 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5-pro': { name: 'GPT-5 Pro', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 10, outputPerMillion: 30 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5.1': { name: 'GPT-5.1', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 5, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5.2': { name: 'GPT-5.2', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 5, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5.3-chat-latest': { name: 'GPT-5.3', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 5, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5.4': { name: 'GPT-5.4', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 5, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5.4-pro': { name: 'GPT-5.4 Pro', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 10, outputPerMillion: 30 }, supportsVision: true, supportsFunctions: true },
  'openai/gpt-5.2-pro': { name: 'GPT-5.2 Pro', category: 'reasoning', contextWindow: 1047576, maxOutputTokens: 32768, pricing: { inputPerMillion: 10, outputPerMillion: 30 }, supportsVision: true, supportsFunctions: true },
  'openai/o1': { name: 'o1', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 15, outputPerMillion: 60 }, supportsFunctions: true },
  'openai/o1-pro': { name: 'o1 Pro', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 150, outputPerMillion: 600 }, supportsFunctions: true },
  'openai/o4-mini-deep-research': { name: 'o4 Mini Deep Research', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 100000, pricing: { inputPerMillion: 2, outputPerMillion: 8 }, supportsFunctions: true },

  // Anthropic
  'anthropic/claude-opus-4-20250514': { name: 'Claude Opus 4', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 32000, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-sonnet-4-20250514': { name: 'Claude Sonnet 4', category: 'chat', contextWindow: 200000, maxOutputTokens: 64000, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-haiku-4-5-20251001': { name: 'Claude Haiku 4.5', category: 'chat', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.8, outputPerMillion: 4 }, supportsFunctions: true },
  'anthropic/claude-sonnet-4-6': { name: 'Claude Sonnet 4.6', category: 'chat', contextWindow: 200000, maxOutputTokens: 64000, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-opus-4-6': { name: 'Claude Opus 4.6', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 32000, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-opus-4-5-20251101': { name: 'Claude Opus 4.5', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 32000, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-sonnet-4-5-20250929': { name: 'Claude Sonnet 4.5', category: 'chat', contextWindow: 200000, maxOutputTokens: 64000, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-opus-4-1-20250805': { name: 'Claude Opus 4.1', category: 'reasoning', contextWindow: 200000, maxOutputTokens: 32000, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, supportsVision: true, supportsFunctions: true },
  'anthropic/claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet', category: 'chat', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsVision: true, supportsFunctions: true },

  // Google Gemini
  'gemini/gemini-2.5-pro': { name: 'Gemini 2.5 Pro', category: 'reasoning', contextWindow: 1048576, maxOutputTokens: 65536, pricing: { inputPerMillion: 1.25, outputPerMillion: 10 }, supportsVision: true, supportsFunctions: true },
  'gemini/gemini-2.5-flash': { name: 'Gemini 2.5 Flash', category: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, supportsVision: true, supportsFunctions: true },
  'gemini/gemini-2.0-flash': { name: 'Gemini 2.0 Flash', category: 'chat', contextWindow: 1048576, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 }, supportsVision: true, supportsFunctions: true },
  'gemini/gemini-2.0-flash-lite': { name: 'Gemini 2.0 Flash Lite', category: 'chat', contextWindow: 1048576, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 }, supportsVision: true },
  'gemini/gemini-1.5-pro': { name: 'Gemini 1.5 Pro', category: 'chat', contextWindow: 1048576, maxOutputTokens: 8192, pricing: { inputPerMillion: 1.25, outputPerMillion: 5 }, supportsVision: true, supportsFunctions: true },
  'gemini/gemini-1.5-flash': { name: 'Gemini 1.5 Flash', category: 'chat', contextWindow: 1048576, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 }, supportsVision: true, supportsFunctions: true },

  // Groq
  'groq/llama-3.3-70b-versatile': { name: 'Llama 3.3 70B (Groq)', category: 'chat', contextWindow: 128000, maxOutputTokens: 32768, pricing: { inputPerMillion: 0.59, outputPerMillion: 0.79 }, supportsFunctions: true },
  'groq/llama-3.1-8b-instant': { name: 'Llama 3.1 8B (Groq)', category: 'chat', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.05, outputPerMillion: 0.08 } },
  'groq/gemma2-9b-it': { name: 'Gemma 2 9B (Groq)', category: 'chat', contextWindow: 8192, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.2, outputPerMillion: 0.2 } },
  'groq/deepseek-r1-distill-llama-70b': { name: 'DeepSeek R1 Distill 70B (Groq)', category: 'reasoning', contextWindow: 128000, maxOutputTokens: 16384, pricing: { inputPerMillion: 0.75, outputPerMillion: 0.99 } },

  // Mistral
  'mistral/mistral-large-latest': { name: 'Mistral Large', category: 'chat', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 2, outputPerMillion: 6 }, supportsFunctions: true },
  'mistral/mistral-small-latest': { name: 'Mistral Small', category: 'chat', contextWindow: 32000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.3 }, supportsFunctions: true },
  'mistral/codestral-latest': { name: 'Codestral', category: 'code', contextWindow: 32000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.3, outputPerMillion: 0.9 } },
  'mistral/pixtral-large-latest': { name: 'Pixtral Large', category: 'vision', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 2, outputPerMillion: 6 }, supportsVision: true },

  // DeepSeek
  'deepseek/deepseek-chat': { name: 'DeepSeek V3', category: 'chat', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.27, outputPerMillion: 1.1 }, supportsFunctions: true },
  'deepseek/deepseek-reasoner': { name: 'DeepSeek R1', category: 'reasoning', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19 } },

  // xAI
  'xai/grok-3': { name: 'Grok 3', category: 'chat', contextWindow: 131072, maxOutputTokens: 8192, pricing: { inputPerMillion: 3, outputPerMillion: 15 }, supportsFunctions: true },
  'xai/grok-3-mini': { name: 'Grok 3 Mini', category: 'chat', contextWindow: 131072, maxOutputTokens: 8192, pricing: { inputPerMillion: 0.3, outputPerMillion: 0.5 }, supportsFunctions: true },
  'xai/grok-4-0709': { name: 'Grok 4', category: 'reasoning', contextWindow: 256000, maxOutputTokens: 16384, pricing: { inputPerMillion: 6, outputPerMillion: 18 }, supportsFunctions: true },
  'xai/grok-2-latest': { name: 'Grok 2', category: 'chat', contextWindow: 131072, maxOutputTokens: 8192, pricing: { inputPerMillion: 2, outputPerMillion: 10 }, supportsFunctions: true },

  // Together AI
  'together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo': { name: 'Llama 3.3 70B Turbo', category: 'chat', contextWindow: 128000, maxOutputTokens: 4096, pricing: { inputPerMillion: 0.88, outputPerMillion: 0.88 }, supportsFunctions: true },
  'together_ai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': { name: 'Llama 3.1 405B Turbo', category: 'chat', contextWindow: 128000, maxOutputTokens: 4096, pricing: { inputPerMillion: 3.5, outputPerMillion: 3.5 } },
  'together_ai/deepseek-ai/DeepSeek-R1': { name: 'DeepSeek R1 (Together)', category: 'reasoning', contextWindow: 64000, maxOutputTokens: 8192, pricing: { inputPerMillion: 3.0, outputPerMillion: 7.0 } },

  // Perplexity
  'perplexity/sonar': { name: 'Sonar', category: 'chat', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 1, outputPerMillion: 1 } },
  'perplexity/sonar-pro': { name: 'Sonar Pro', category: 'chat', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 3, outputPerMillion: 15 } },
  'perplexity/sonar-reasoning': { name: 'Sonar Reasoning', category: 'reasoning', contextWindow: 128000, maxOutputTokens: 8192, pricing: { inputPerMillion: 1, outputPerMillion: 5 } },

  // Cohere
  'cohere/command-r-plus': { name: 'Command R+', category: 'chat', contextWindow: 128000, maxOutputTokens: 4096, pricing: { inputPerMillion: 2.5, outputPerMillion: 10 }, supportsFunctions: true },
  'cohere/command-r': { name: 'Command R', category: 'chat', contextWindow: 128000, maxOutputTokens: 4096, pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, supportsFunctions: true },
};

/** Provider display names for grouping */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google',
  google: 'Google',
  groq: 'Groq',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  together_ai: 'Together AI',
  fireworks_ai: 'Fireworks AI',
  perplexity: 'Perplexity',
  cohere: 'Cohere',
  moonshot: 'Moonshot',
  huggingface: 'Hugging Face',
  minimax: 'MiniMax',
  'meta-llama': 'Meta',
};

// ============================================================================
// FETCH MODELS
// ============================================================================

/**
 * Fetch all models from TrustGate (LiteLLM catalog).
 * Returns cached data if still valid.
 */
export async function fetchModels(): Promise<ModelConfig[]> {
  const now = Date.now();
  const shouldUseCache = process.env.NODE_ENV === 'production';
  if (shouldUseCache && modelsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return modelsCache;
  }

  try {
    const models = await fetchTrustGateModels();
    if (models.length === 0) {
      console.log('[ai/models] No models from TrustGate, using fallback');
      return getFallbackModels();
    }

    console.log(`[ai/models] Fetched ${models.length} models from TrustGate`);
    modelsCache = models;
    cacheTimestamp = now;
    return models;
  } catch (error) {
    console.error('[ai/models] Error fetching models:', error);
    return getFallbackModels();
  }
}

/**
 * Fetch models from TrustGate /v1/models (LiteLLM catalog).
 * Returns OpenAI-format model list, filtered and enriched.
 */
async function fetchTrustGateModels(): Promise<ModelConfig[]> {
  if (!TRUSTGATE_BASE_URL) return [];

  try {
    const res = await fetch(`${TRUSTGATE_BASE_URL}/v1/models`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`TrustGate returned ${res.status}`);
    const data = await res.json();

    const rawModels: Array<{ id: string; owned_by?: string; created?: number }> =
      data?.data ?? [];

    // Filter to chat-capable models only
    const allIds = new Set(rawModels.map(m => m.id));
    const filtered = rawModels.filter(m => {
      const id = m.id;
      // Skip wildcard patterns
      if (id.includes('*')) return false;
      // Skip fine-tuned models
      if (id.includes('/ft:')) return false;
      if (id.startsWith('ft:')) return false;
      // Skip perplexity-proxied provider models
      if (/^perplexity\/(openai|anthropic|google|meta|xai|perplexity)\//.test(id)) return false;
      // Skip perplexity presets and old models
      if (/^perplexity\/(preset|pplx-|codellama|mixtral|llama-[23]\.|mistral-7b|sonar-(small|medium))/.test(id)) return false;
      // Skip unprefixed aliases (already covered by prefixed versions)
      if (!id.includes('/')) return false;
      // Skip non-chat models (embeddings, images, video, audio, TTS, moderation, rerank, realtime)
      if (/(embed|dall-e|sora|veo|imagen|tts|whisper|transcribe|moderation|rerank|gpt-image|grok-imagine|aqa|realtime|gpt-audio|native-audio)/.test(id)) return false;
      // Skip deprecated/old models
      if (/gpt-3\.5|gpt-4-0613|gpt-4-0314|babbage|davinci-002|gpt-4-turbo|open-mistral-7b|mistral-tiny|open-codestral-mamba/.test(id)) return false;
      // Skip old/irrelevant open-source models
      if (/(llama-2|Llama-2|falcon|WizardLM|WizardCoder|starchat|chronos|alpaca|nsql|sqlcoder|defog|solar-0|Nous-Hermes|CodeLlama|gemma-7b|gpt-4[^.o])/i.test(id)) return false;
      // Skip date-pinned variants if the non-dated alias exists
      const dateMatch = id.match(/^(.+)-\d{4}-\d{2}-\d{2}$/);
      if (dateMatch && allIds.has(dateMatch[1])) return false;
      // Skip "-chat-latest" variants if base exists
      if (id.endsWith('-chat-latest')) {
        const base = id.replace(/-chat-latest$/, '');
        if (allIds.has(base)) return false;
      }
      // Skip experimental/preview models
      if (/-(exp|preview)(-|$)/.test(id)) return false;
      // Skip versioned duplicates for Mistral (keep only -latest)
      if (/^mistral\//.test(id) && /-\d{4}$/.test(id)) {
        const latestAlias = id.replace(/-\d{4}$/, '-latest');
        if (allIds.has(latestAlias)) return false;
      }
      return true;
    });

    return filtered.map(m => transformGatewayModel(m.id, m.owned_by));
  } catch (error) {
    console.error('[ai/models] TrustGate fetch failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Transform a TrustGate/LiteLLM model into ModelConfig.
 */
function transformGatewayModel(modelId: string, ownedBy?: string): ModelConfig {
  const meta = GATEWAY_MODEL_META[modelId];

  // Derive provider from model ID prefix
  const providerKey = modelId.split('/')[0] || ownedBy || 'unknown';
  const provider = PROVIDER_DISPLAY_NAMES[providerKey] || providerKey;

  // Derive human-readable name from ID if no metadata
  const name = meta?.name || formatGatewayModelName(modelId);
  const category = meta?.category || inferCategory(modelId);

  return {
    id: modelId,
    modelId,
    name,
    provider,
    category,
    description: `Via Lucid Gateway`,
    contextWindow: meta?.contextWindow || 128000,
    maxOutputTokens: meta?.maxOutputTokens || 8192,
    pricing: meta?.pricing || { inputPerMillion: 1.0, outputPerMillion: 1.0 },
    isFeatured: isFeaturedModel(modelId),
    isNew: isNewModel(modelId),
    supportsFunctions: meta?.supportsFunctions ?? true,
    supportsVision: meta?.supportsVision ?? false,
    supportsStreaming: true,
    modelMeta: { source: 'gateway' },
  };
}

/**
 * Format a gateway model ID into a human-readable name.
 * e.g. "openai/gpt-4.1-mini-2025-04-14" → "GPT 4.1 Mini (2025-04-14)"
 */
function formatGatewayModelName(modelId: string): string {
  // Remove provider prefix
  const parts = modelId.split('/');
  const rawName = parts.length > 1 ? parts.slice(1).join('/') : parts[0];

  // Extract date suffix if present
  const dateMatch = rawName.match(/-(\d{4}-\d{2}-\d{2})$/);
  const dateSuffix = dateMatch ? ` (${dateMatch[1]})` : '';
  const nameWithoutDate = dateMatch ? rawName.replace(/-\d{4}-\d{2}-\d{2}$/, '') : rawName;

  // Clean up the name
  return nameWithoutDate
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() + dateSuffix;
}

/**
 * Infer category from model ID
 */
function inferCategory(modelId: string): ModelCategory {
  const id = modelId.toLowerCase();
  if (id.includes('vision')) return 'vision';
  if (id.includes('r1') || id.includes('o1') || /\/o[34]/.test(id) || id.includes('reasoner')) return 'reasoning';
  if (id.includes('coder') || id.includes('codestral')) return 'code';
  if (id.includes('embed')) return 'embedding';
  return 'chat';
}

/**
 * Check if model is featured
 */
function isFeaturedModel(modelId: string): boolean {
  const featured = [
    'gpt-4.1',
    'gpt-5',
    'claude-opus-4',
    'claude-sonnet-4',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'deepseek-chat',
  ];
  return featured.some(f => modelId.toLowerCase().includes(f.toLowerCase()));
}

/**
 * Check if model is new
 */
function isNewModel(modelId: string): boolean {
  const newModels = [
    'gpt-5',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'gemini-2.5',
    'o4-mini',
    'o3',
  ];
  return newModels.some(n => modelId.includes(n));
}

// ============================================================================
// FALLBACK MODELS (When API unavailable)
// ============================================================================

function getFallbackModels(): ModelConfig[] {
  return [
    {
      id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      name: 'Llama 3.3 70B',
      provider: 'meta-llama',
      category: 'chat',
      description: 'Latest Llama model · 128K context',
      contextWindow: 131072,
      maxOutputTokens: 4096,
      pricing: { inputPerMillion: 0.88, outputPerMillion: 0.88 },
      isDefault: true,
      isFeatured: true,
      supportsFunctions: true,
      supportsStreaming: true,
    },
    {
      id: 'deepseek-ai/DeepSeek-V3',
      modelId: 'deepseek-ai/DeepSeek-V3',
      name: 'DeepSeek V3',
      provider: 'deepseek-ai',
      category: 'chat',
      description: 'State-of-the-art open model',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      pricing: { inputPerMillion: 0.90, outputPerMillion: 0.90 },
      isNew: true,
      isFeatured: true,
      supportsFunctions: true,
      supportsStreaming: true,
    },
    {
      id: 'gpt-4o',
      modelId: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      category: 'chat',
      description: 'Most capable OpenAI model',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00 },
      isFeatured: true,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
    },
  ];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all models (async - fetches from API)
 */
export async function getModels(): Promise<ModelConfig[]> {
  return fetchModels();
}

/**
 * Get model by ID (async)
 */
export async function getModel(modelId: string): Promise<ModelConfig | null> {
  const models = await fetchModels();
  return models.find(m => m.id === modelId || m.modelId === modelId || m.passportId === modelId) || null;
}

/**
 * Get models by category (async)
 */
export async function getModelsByCategory(category: ModelCategory): Promise<ModelConfig[]> {
  const models = await fetchModels();
  return models.filter(m => m.category === category);
}

/**
 * Get featured models (async)
 */
export async function getFeaturedModels(): Promise<ModelConfig[]> {
  const models = await fetchModels();
  return models.filter(m => m.isFeatured);
}

/**
 * Get default model
 */
export async function getDefaultModel(category: ModelCategory = 'chat'): Promise<ModelConfig | null> {
  const models = await fetchModels();
  return models.find(m => m.category === category && m.isDefault) || 
         models.find(m => m.category === category) || 
         models[0] || 
         null;
}

/**
 * Get models grouped by provider (async)
 */
export async function getModelsGroupedByProvider(): Promise<Record<string, ModelConfig[]>> {
  const models = await fetchModels();
  const grouped: Record<string, ModelConfig[]> = {};
  
  for (const model of models) {
    if (!grouped[model.provider]) {
      grouped[model.provider] = [];
    }
    grouped[model.provider].push(model);
  }
  
  return grouped;
}

// ============================================================================
// PRICING HELPERS
// ============================================================================

/**
 * Calculate cost for a request
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  pricing?: ModelPricing
): number {
  const effectivePricing = pricing || { inputPerMillion: 1.0, outputPerMillion: 1.0 };
  
  const inputCost = (inputTokens / 1_000_000) * effectivePricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * effectivePricing.outputPerMillion;
  
  return inputCost + outputCost;
}

/**
 * Calculate cost in cents (for database storage)
 */
export function calculateCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  pricing?: ModelPricing
): number {
  return Math.ceil(calculateCost(modelId, inputTokens, outputTokens, pricing) * 100);
}

// ============================================================================
// EMBEDDING MODELS
// ============================================================================

export interface EmbeddingModel {
  id: string;
  name: string;
  provider: string;
  dimensions: number;
  maxInput: number;
  pricing: { perMillion: number };
}

/**
 * Get default embedding model
 * TODO: Fetch from Lucid-L2 API when embeddings endpoint is available
 */
export function getDefaultEmbeddingModel(): EmbeddingModel {
  return {
    id: 'text-embedding-3-small',
    name: 'OpenAI Embedding Small',
    provider: 'openai',
    dimensions: 1536,
    maxInput: 8191,
    pricing: { perMillion: 0.02 },
  };
}
