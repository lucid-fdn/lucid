import 'server-only'

import {
  generateText as aiGenerateText,
  type LanguageModel,
} from 'ai'

import { getBYOKModel } from '@/lib/ai/byok-provider'
import { generateText as gatewayGenerateText } from '@/lib/ai/gateway'
import { DEFAULT_MODEL_ID } from '@/lib/ai/models'
import { normalizeProviderSecret } from '@/lib/ai/provider-policy'
import { isLucidConfigured } from '@/lib/ai/providers'
import { runInternalWorkerAgent } from '@/lib/ai/platform/agent-runtime/internal-agent-client'

import {
  getInternalAgentProfile,
  resolveInternalAgentBackend,
  type InternalAgentProfile,
  type InternalAgentProfileName,
} from './internal-agent-profiles'

export interface InternalAgentModelResolution {
  requestedModelId: string
  modelId: string
  model: string | LanguageModel
  useGatewayFallback: boolean
}

export interface RunInternalTextAgentInput {
  profile: InternalAgentProfileName
  orgId: string
  systemPrompt: string
  prompt: string
  messages?: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  requestedModelId?: string
  userId?: string
  temperature?: number
  maxTokens?: number
}

const OPENAI_FALLBACK_MODEL_ID = 'gpt-4.1-mini'

function canUseOpenAIFallback() {
  return Boolean(normalizeProviderSecret(process.env.OPENAI_API_KEY))
}

export async function resolveInternalAgentModel(
  orgId: string,
  requestedModelId = DEFAULT_MODEL_ID,
): Promise<InternalAgentModelResolution> {
  const useGatewayFallback = !isLucidConfigured() && canUseOpenAIFallback()
  const modelId = useGatewayFallback ? OPENAI_FALLBACK_MODEL_ID : requestedModelId
  const model = useGatewayFallback
    ? modelId
    : (await getBYOKModel(orgId, modelId)).model

  return {
    requestedModelId,
    modelId,
    model,
    useGatewayFallback,
  }
}

async function runInternalAgentLocal(input: {
  profile: InternalAgentProfile
  resolution: InternalAgentModelResolution
  systemPrompt: string
  prompt: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  temperature?: number
  maxTokens?: number
}) {
  if (typeof input.resolution.model === 'string') {
    const result = await gatewayGenerateText({
      model: input.resolution.model,
      system: input.systemPrompt,
      messages: [
        ...input.messages,
        { role: 'user', content: input.prompt },
      ],
      temperature: input.temperature ?? 0.2,
      maxTokens: input.maxTokens ?? input.profile.maxOutputTokens,
    })

    return {
      text: result.text?.trim() || '',
      modelId: input.resolution.modelId,
      backend: 'local-orchestrator' as const,
    }
  }

  const result = await aiGenerateText({
    model: input.resolution.model,
    system: input.systemPrompt,
    messages: [
      ...input.messages,
      { role: 'user', content: input.prompt },
    ],
    temperature: input.temperature ?? 0.2,
    maxOutputTokens: input.maxTokens ?? input.profile.maxOutputTokens,
  })

  return {
    text: result.text?.trim() || '',
    modelId: input.resolution.modelId,
    backend: 'local-orchestrator' as const,
  }
}

export async function runInternalTextAgent(
  input: RunInternalTextAgentInput,
): Promise<{
  text: string
  modelId: string
  backend: 'worker-agent' | 'local-orchestrator'
}> {
  const profile = getInternalAgentProfile(input.profile)
  const backend = resolveInternalAgentBackend(profile)
  const resolution = await resolveInternalAgentModel(
    input.orgId,
    input.requestedModelId ?? DEFAULT_MODEL_ID,
  )
  const messages = input.messages ?? []

  if (backend === 'worker-agent') {
    try {
      const result = await runInternalWorkerAgent({
        agent: {
          name: profile.name,
          engine: 'openclaw',
          systemPrompt: input.systemPrompt,
          model: resolution.modelId,
          temperature: input.temperature ?? 0.2,
          maxTokens: input.maxTokens ?? profile.maxOutputTokens,
          orgId: input.orgId,
          userId: input.userId,
          memoryEnabled: false,
        },
        input: {
          message: input.prompt,
          messages,
        },
        policy: {
          allowBuiltInSkills: profile.allowBuiltInSkills,
          allowedTools: profile.allowedTools,
        },
        budget: {
          maxLlmCalls: profile.maxLlmCalls,
          maxToolCalls: profile.maxToolCalls,
          maxWallTimeMs: profile.maxWallTimeMs,
          maxOutputTokens: input.maxTokens ?? profile.maxOutputTokens,
        },
      })

      return {
        text: result.text?.trim() || '',
        modelId: resolution.modelId,
        backend: 'worker-agent',
      }
    } catch {
      // Fall through to the local orchestrator so product routes stay resilient.
    }
  }

  return runInternalAgentLocal({
    profile,
    resolution,
    systemPrompt: input.systemPrompt,
    prompt: input.prompt,
    messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  })
}
