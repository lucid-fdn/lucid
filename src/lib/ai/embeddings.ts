/**
 * AI Embeddings
 *
 * Vector embedding generation using Vercel AI SDK v6.
 * Uses Lucid-L2 endpoint for embedding models (OpenAI-compatible).
 *
 * Used for:
 * - RAG (Retrieval-Augmented Generation) — document similarity search
 * - Memory system — finding relevant memories for conversation context
 * - Marketplace search — semantic search across assets
 *
 * @example
 * ```ts
 * // Single embedding
 * const { embedding } = await generateEmbedding('How to deploy Next.js')
 *
 * // Batch embeddings (more efficient)
 * const { embeddings } = await generateEmbeddings([
 *   'Deploy Next.js to Vercel',
 *   'Set up CI/CD pipeline',
 *   'Configure environment variables',
 * ])
 * ```
 */

import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createHash } from 'node:crypto'
import { lucid } from './providers'
import { ErrorService } from '@/lib/errors/error-service'
import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  resolveProviderOverride,
} from './provider-policy'

// ============================================================================
// PROVIDER SETUP
// ============================================================================

/** Default embedding model — fast, good quality, 1536 dimensions */
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_EMBEDDING_CACHE_TTL_MS = 60_000
const MAX_EMBEDDING_CACHE_ENTRIES = 1_000

type EmbeddingCacheEntry = {
  expiresAt: number
  promise: Promise<EmbeddingResult>
}

const embeddingCache = new Map<string, EmbeddingCacheEntry>()
type EmbeddingProvider = 'auto' | 'lucid' | 'trustgate' | 'openai'
type EmbeddingModelInstance = ReturnType<typeof getEmbeddingModel>
type EmbeddingProviderCandidate = {
  provider: Exclude<EmbeddingProvider, 'auto'>
  model: EmbeddingModelInstance
}

/**
 * Create an embedding model instance via the SDK provider.
 * Uses the same createLucidProvider as chat/inference.
 */
function getEmbeddingModel(modelId: string = DEFAULT_EMBEDDING_MODEL) {
  return lucid.textEmbeddingModel(modelId)
}

function getOpenAIEmbeddingModel(modelId: string = DEFAULT_EMBEDDING_MODEL): EmbeddingModelInstance | null {
  const apiKey = normalizeProviderSecret(process.env.OPENAI_API_KEY)
  if (!apiKey) return null
  const provider = createOpenAI({
    apiKey,
    baseURL: normalizeProviderBaseUrl(process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1',
  })
  return provider.textEmbeddingModel(modelId) as EmbeddingModelInstance
}

// ============================================================================
// SINGLE EMBEDDING
// ============================================================================

interface EmbeddingResult {
  embedding: number[]
  usage: { tokens: number }
  providerId?: string
}

/**
 * Generate a single embedding vector for text.
 *
 * @param text - The text to embed
 * @param modelId - Optional model override
 * @returns The embedding vector and token usage
 */
export async function generateEmbedding(
  text: string,
  modelId?: string
): Promise<EmbeddingResult> {
  if (shouldUseDeterministicEmbeddings()) {
    return {
      embedding: deterministicEmbedding(text),
      usage: { tokens: Math.ceil(text.length / 4) },
      providerId: `deterministic:${modelId ?? DEFAULT_EMBEDDING_MODEL}`,
    }
  }

  return cachedEmbedding(text, modelId, async () => {
    return withEmbeddingProviderFallback(modelId, async (model, provider) => {
      const result = await embed({
        model,
        value: text,
      })

      return {
        embedding: result.embedding,
        usage: { tokens: result.usage?.tokens ?? 0 },
        providerId: `${provider}:${modelId ?? DEFAULT_EMBEDDING_MODEL}`,
      }
    })
  })
}

function cachedEmbedding(
  text: string,
  modelId: string | undefined,
  loader: () => Promise<EmbeddingResult>,
): Promise<EmbeddingResult> {
  const ttlMs = getEmbeddingCacheTtlMs()
  if (ttlMs <= 0) return captureEmbeddingErrors(text, modelId, loader)

  const now = Date.now()
  const key = buildEmbeddingCacheKey(text, modelId)
  const existing = embeddingCache.get(key)
  if (existing && existing.expiresAt > now) return existing.promise

  if (embeddingCache.size >= MAX_EMBEDDING_CACHE_ENTRIES) pruneEmbeddingCache(now)

  const promise = captureEmbeddingErrors(text, modelId, loader).catch((error) => {
    embeddingCache.delete(key)
    throw error
  })
  embeddingCache.set(key, { expiresAt: now + ttlMs, promise })
  return promise
}

async function captureEmbeddingErrors(
  text: string,
  modelId: string | undefined,
  loader: () => Promise<EmbeddingResult>,
): Promise<EmbeddingResult> {
  try {
    return await loader()
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'generateEmbedding', textLength: text.length, modelId },
      tags: { layer: 'ai', feature: 'embeddings' },
    })
    throw error
  }
}

// ============================================================================
// BATCH EMBEDDINGS
// ============================================================================

interface BatchEmbeddingResult {
  embeddings: number[][]
  usage: { tokens: number }
  providerId?: string
}

/**
 * Generate embedding vectors for multiple texts in a single API call.
 * More efficient than calling generateEmbedding() in a loop.
 *
 * @param texts - Array of texts to embed
 * @param modelId - Optional model override
 * @returns Array of embedding vectors and total token usage
 */
export async function generateEmbeddings(
  texts: string[],
  modelId?: string
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], usage: { tokens: 0 } }
  }

  if (shouldUseDeterministicEmbeddings()) {
    return {
      embeddings: texts.map((text) => deterministicEmbedding(text)),
      usage: { tokens: texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0) },
      providerId: `deterministic:${modelId ?? DEFAULT_EMBEDDING_MODEL}`,
    }
  }

  try {
    return await withEmbeddingProviderFallback(modelId, async (model, provider) => {
      const result = await embedMany({
        model,
        values: texts,
      })

      return {
        embeddings: result.embeddings,
        usage: { tokens: result.usage?.tokens ?? 0 },
        providerId: `${provider}:${modelId ?? DEFAULT_EMBEDDING_MODEL}`,
      }
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'generateEmbeddings', count: texts.length, modelId },
      tags: { layer: 'ai', feature: 'embeddings' },
    })
    throw error
  }
}

// ============================================================================
// SIMILARITY UTILITIES
// ============================================================================

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 (opposite) and 1 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Find the most similar items from a collection of embeddings.
 *
 * @param query - The query embedding vector
 * @param candidates - Array of { id, embedding } pairs
 * @param topK - Number of top results to return
 * @returns Sorted array of { id, similarity } (highest first)
 */
export function findSimilar<T extends { id: string; embedding: number[] }>(
  query: number[],
  candidates: T[],
  topK: number = 10
): Array<{ id: string; similarity: number }> {
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      similarity: cosineSimilarity(query, candidate.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_EMBEDDING_MODEL,
  getEmbeddingModel,
}

function shouldUseDeterministicEmbeddings(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.KNOWLEDGE_E2E_FAKE_EMBEDDINGS === 'true'
}

function getEmbeddingCacheTtlMs(): number {
  const raw = Number.parseInt(process.env.LUCID_EMBEDDING_CACHE_TTL_MS ?? '', 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_EMBEDDING_CACHE_TTL_MS
}

async function withEmbeddingProviderFallback<T>(
  modelId: string | undefined,
  run: (model: EmbeddingModelInstance, provider: Exclude<EmbeddingProvider, 'auto'>) => Promise<T>,
): Promise<T> {
  const mode = resolveEmbeddingProvider()
  const candidates = buildEmbeddingProviderCandidates(modelId, mode)
  let lastError: unknown

  for (const candidate of candidates) {
    try {
      return await run(candidate.model, candidate.provider)
    } catch (error) {
      lastError = error
      if (mode !== 'auto') break
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No embedding provider could generate an embedding.')
}

function buildEmbeddingProviderCandidates(
  modelId: string | undefined,
  mode: EmbeddingProvider,
): EmbeddingProviderCandidate[] {
  const lucidCandidate: EmbeddingProviderCandidate = {
    provider: mode === 'trustgate' ? 'trustgate' : 'lucid',
    model: getEmbeddingModel(modelId),
  }
  const openAIModel = getOpenAIEmbeddingModel(modelId)
  const openAICandidate = openAIModel
    ? [{ provider: 'openai' as const, model: openAIModel }]
    : []

  if (mode === 'openai') return openAICandidate
  if (mode === 'lucid' || mode === 'trustgate') return [lucidCandidate]
  return [lucidCandidate, ...openAICandidate]
}

function resolveEmbeddingProvider(): EmbeddingProvider {
  return resolveProviderOverride<EmbeddingProvider>(
    process.env.AI_EMBEDDING_PROVIDER ??
      process.env.KNOWLEDGE_EMBEDDING_PROVIDER ??
      process.env.EMBEDDING_PROVIDER ??
      process.env.AI_PROVIDER,
    ['auto', 'lucid', 'trustgate', 'openai'] as const,
    'auto',
  )
}

function buildEmbeddingCacheKey(text: string, modelId?: string): string {
  return createHash('sha256')
    .update(modelId ?? DEFAULT_EMBEDDING_MODEL)
    .update('\0')
    .update(text)
    .digest('hex')
}

function pruneEmbeddingCache(now: number): void {
  for (const [key, entry] of embeddingCache) {
    if (entry.expiresAt <= now || embeddingCache.size >= MAX_EMBEDDING_CACHE_ENTRIES) {
      embeddingCache.delete(key)
    }
    if (embeddingCache.size < MAX_EMBEDDING_CACHE_ENTRIES) break
  }
}

function deterministicEmbedding(text: string): number[] {
  const seed = createHash('sha256').update(text).digest()
  return Array.from({ length: 1536 }, (_, index) => {
    const byte = seed[index % seed.length]
    return (byte / 255) * 2 - 1
  })
}
