import 'server-only'

import {
  embed as aiEmbed,
  generateObject as aiGenerateObject,
  generateText as aiGenerateText,
  streamText as aiStreamText,
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import {
  generateEmbedding,
  generateEmbeddings,
} from './embeddings'
import { runImageGeneration } from './images/provider'
import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  resolveProviderOverride,
} from './provider-policy'
import type {
  AIGatewayProvider,
  EmbedInput,
  EmbedManyInput,
  GatewayGenerateObjectResult,
  GatewayGenerateTextResult,
  GatewayImageResult,
  GatewayStreamTextResult,
  GenerateImageInput,
  GenerateObjectInput,
  GenerateTextInput,
  StreamTextInput,
} from './gateway-types'
import type { ZodTypeAny } from 'zod'

const DEFAULT_GATEWAY_PROVIDER: AIGatewayProvider = 'auto'
const DEFAULT_TEXT_MODEL = 'gpt-4.1-mini'

function resolveAIGatewayProvider(override?: AIGatewayProvider): AIGatewayProvider {
  if (override) return override
  return resolveProviderOverride<AIGatewayProvider>(
    process.env.AI_PROVIDER,
    ['trustgate', 'openai', 'auto'] as const,
    DEFAULT_GATEWAY_PROVIDER,
  )
}

function buildTrustGateCandidate(): { provider: 'trustgate'; baseUrl: string; apiKey: string } | null {
  const baseUrl =
    normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL) ??
    normalizeProviderBaseUrl(process.env.LUCID_API_BASE_URL)
  const apiKey =
    normalizeProviderSecret(process.env.TRUSTGATE_API_KEY) ??
    normalizeProviderSecret(process.env.LUCID_API_KEY)

  if (!baseUrl || !apiKey) return null
  return { provider: 'trustgate', baseUrl, apiKey }
}

function buildOpenAICandidate(): { provider: 'openai'; baseUrl: string; apiKey: string } | null {
  const apiKey = normalizeProviderSecret(process.env.OPENAI_API_KEY)
  if (!apiKey) return null
  return {
    provider: 'openai',
    baseUrl: normalizeProviderBaseUrl(process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1',
    apiKey,
  }
}

function resolveTextProvider(override?: AIGatewayProvider): { provider: 'trustgate' | 'openai'; baseUrl: string; apiKey: string } {
  const target = resolveAIGatewayProvider(override)
  const trustgate = buildTrustGateCandidate()
  const openai = buildOpenAICandidate()

  if (target === 'trustgate') {
    if (!trustgate) throw new Error('TrustGate text provider is not configured.')
    return trustgate
  }

  if (target === 'openai') {
    if (!openai) throw new Error('OpenAI text provider is not configured.')
    return openai
  }

  return trustgate ?? openai ?? (() => {
    throw new Error('No AI text provider is configured.')
  })()
}

function resolveLanguageModel(input: GenerateTextInput | StreamTextInput | GenerateObjectInput<ZodTypeAny>): LanguageModel {
  const resolved = resolveTextProvider(input.provider)
  const provider = createOpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseUrl.endsWith('/v1') ? resolved.baseUrl : `${resolved.baseUrl}/v1`,
  })
  return provider.chat(normalizeModelForProvider(input.model || DEFAULT_TEXT_MODEL, resolved.provider))
}

function normalizeModelForProvider(model: string, provider: 'trustgate' | 'openai'): string {
  if (provider === 'openai' && model.startsWith('openai/')) {
    return model.slice('openai/'.length)
  }

  return model
}

export async function generateText(input: GenerateTextInput): Promise<GatewayGenerateTextResult> {
  return aiGenerateText({
    model: resolveLanguageModel(input),
    messages: input.messages,
    ...(input.system ? { system: input.system } : {}),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.experimentalTelemetry ? { experimental_telemetry: input.experimentalTelemetry } : {}),
  })
}

export function streamText(input: StreamTextInput): GatewayStreamTextResult {
  return aiStreamText({
    model: resolveLanguageModel(input),
    messages: input.messages,
    ...(input.system ? { system: input.system } : {}),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.experimentalTelemetry ? { experimental_telemetry: input.experimentalTelemetry } : {}),
  })
}

export async function generateObject<TSchema extends ZodTypeAny>(
  input: GenerateObjectInput<TSchema>,
): Promise<GatewayGenerateObjectResult<TSchema>> {
  return aiGenerateObject({
    model: resolveLanguageModel(input),
    schema: input.schema,
    messages: input.messages,
    ...(input.system ? { system: input.system } : {}),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
    ...(input.experimentalTelemetry ? { experimental_telemetry: input.experimentalTelemetry } : {}),
  })
}

export async function embed(input: EmbedInput): Promise<{ embedding: number[]; usage: { tokens: number } }> {
  const provider = resolveAIGatewayProvider(input.provider)
  if (provider === 'openai' && !buildOpenAICandidate()) {
    throw new Error('OpenAI embeddings provider is not configured.')
  }
  if (provider === 'trustgate' && !buildTrustGateCandidate()) {
    throw new Error('TrustGate embeddings provider is not configured.')
  }
  return generateEmbedding(input.value, input.model)
}

export async function embedMany(input: EmbedManyInput): Promise<{ embeddings: number[][]; usage: { tokens: number } }> {
  const provider = resolveAIGatewayProvider(input.provider)
  if (provider === 'openai' && !buildOpenAICandidate()) {
    throw new Error('OpenAI embeddings provider is not configured.')
  }
  if (provider === 'trustgate' && !buildTrustGateCandidate()) {
    throw new Error('TrustGate embeddings provider is not configured.')
  }
  return generateEmbeddings(input.values, input.model)
}

export async function generateImage(input: GenerateImageInput): Promise<GatewayImageResult> {
  return runImageGeneration(input)
}
