import type { LanguageModel } from 'ai'

import { generateStructuredObject } from '@/lib/ai/generation'

import { buildIntentSystemPrompt, buildIntentUserPrompt } from './prompts'
import { detectBuilderIntentProfile } from './intent-profiles'
import { aiGenerationIntentSchema, normalizeGenerationIntent, type GenerationIntent } from './schemas'

const COMMON_INTEGRATIONS = [
  'slack',
  'gmail',
  'google calendar',
  'calendar',
  'hubspot',
  'salesforce',
  'notion',
  'jira',
  'linear',
  'zendesk',
  'intercom',
  'shopify',
  'airtable',
]

const COMPLEX_PROMPT_PATTERN = /\b(team|handoff|review|reviewer|coordinator|workflow|pipeline|approval|approve|mcp|plugin|tool|tools|integrat|runtime|dedicated|byo|memory|schedule|channel|eval|cost|policy)\b/i
const META_BUILDER_PROMPT_PATTERN = /\b(what are you doing|what did you do|why did you|what changed|why this|explain (?:this|that|the setup)|what's happening|whats happening|how is this set up|why this setup|what engine(?:s)? are available|which engine(?:s)? are available|what runtime(?:s)? are available|which runtime(?:s)? are available)\b/i

function detectRuntimePreference(prompt: string): GenerationIntent['runtime_preference'] {
  if (/\b(dedicated|private runtime|isolated|always-on)\b/i.test(prompt)) return 'dedicated'
  if (/\b(byo|bring your own|self-hosted)\b/i.test(prompt)) return 'byo'
  if (/\b(shared)\b/i.test(prompt)) return 'shared'
  return undefined
}

function detectLikelyMode(input: {
  prompt: string
  preferredMode?: string
  selectedTemplateSlug?: string
}): GenerationIntent['likely_mode'] {
  if (input.selectedTemplateSlug || input.preferredMode === 'template') return 'template'
  if (input.preferredMode === 'team' || /\b(team|multi-agent|handoff|review loop|reviewer|coordinator)\b/i.test(input.prompt)) {
    return 'blank-team'
  }
  return 'blank-agent'
}

function detectRequiredIntegrations(prompt: string): string[] {
  const lower = prompt.toLowerCase()
  return COMMON_INTEGRATIONS.filter((name) => lower.includes(name)).sort()
}

export function isSimpleBuilderPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  if (!trimmed) return false
  if (trimmed.length > 90) return false
  if (trimmed.split(/\s+/).length > 12) return false
  if (COMPLEX_PROMPT_PATTERN.test(trimmed)) return false
  if ((trimmed.match(/,/g) ?? []).length >= 2) return false
  if (/\b(and|then|plus|while|after)\b/i.test(trimmed)) return false
  return true
}

export function isBuilderMetaConversation(prompt: string): boolean {
  const trimmed = prompt.trim()
  if (!trimmed) return false
  return META_BUILDER_PROMPT_PATTERN.test(trimmed.toLowerCase())
}

export function deriveGenerationIntent(input: {
  prompt: string
  preferredMode?: string
  selectedTemplateSlug?: string
}): GenerationIntent {
  const profile = detectBuilderIntentProfile(input.prompt)
  const runtimePreference = detectRuntimePreference(input.prompt)
  const likelyMode = detectLikelyMode(input)
  const requiredIntegrations = Array.from(new Set([
    ...detectRequiredIntegrations(input.prompt),
    ...(profile?.suggestedIntegrations ?? []),
  ])).sort()
  const teamNeeded = likelyMode === 'blank-team'
  const reuseTemplateLikely = Boolean(input.selectedTemplateSlug)

  return {
    requested_domain: profile?.label,
    requested_outcome: input.prompt.trim(),
    likely_mode: likelyMode,
    required_integrations: requiredIntegrations,
    runtime_preference: runtimePreference,
    missing_required_info: [],
    confidence: isSimpleBuilderPrompt(input.prompt) ? 0.82 : 0.68,
    team_needed: teamNeeded,
    reuse_template_likely: reuseTemplateLikely,
  }
}

export async function extractGenerationIntent(input: {
  model: string | LanguageModel
  prompt: string
  preferredMode?: string
  selectedTemplateSlug?: string
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
  }
}): Promise<GenerationIntent> {
  const result = await generateStructuredObject({
    model: input.model,
    schema: aiGenerationIntentSchema,
    system: buildIntentSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: buildIntentUserPrompt({
          prompt: input.prompt,
          preferredMode: input.preferredMode,
          selectedTemplateSlug: input.selectedTemplateSlug,
        }),
      },
    ],
    telemetry: {
      userId: input.telemetry?.userId,
      orgId: input.telemetry?.orgId,
      modelId: input.telemetry?.modelId,
      feature: 'project-generation-intent',
    },
  })

  return normalizeGenerationIntent(result.object)
}
