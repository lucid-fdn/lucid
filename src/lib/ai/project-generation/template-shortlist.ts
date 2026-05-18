import type { TemplateCatalogEntry } from '@contracts/template'

import { getTemplateRecommendationHintsBySlug } from '@/lib/templates/registry'
import { detectBuilderIntentProfile, scoreTemplateKeywords } from './intent-profiles'
import { normalizeBuilderText } from './normalization'
import type { GenerationMode, GenerationDraft, TemplateMatch } from './schemas'

const STOPWORDS = new Set([
  'a', 'an', 'and', 'for', 'the', 'to', 'of', 'in', 'with', 'that', 'this', 'it', 'on', 'my', 'our',
  'build', 'create', 'make', 'agent', 'team', 'project', 'assistant',
])

type TemplateLane =
  | 'personal'
  | 'executive'
  | 'support'
  | 'sales'
  | 'research'
  | 'monitoring'
  | 'marketing'
  | 'content'
  | 'operations'

const LANE_KEYWORDS: Record<TemplateLane, string[]> = {
  personal: ['personal', 'daily', 'assistant', 'calendar', 'email', 'tasks', 'reminders', 'notes', 'organize', 'schedule'],
  executive: ['ceo', 'executive', 'leadership', 'chief of staff', 'brief', 'briefing', 'board', 'weekly report'],
  support: ['support', 'customer support', 'helpdesk', 'ticket', 'escalation', 'customer success'],
  sales: ['sales', 'outbound', 'prospect', 'prospecting', 'pipeline', 'lead', 'campaign', 'sequence', 'lemlist', 'apollo', 'hubspot'],
  research: ['research', 'intel', 'intelligence', 'analysis', 'competitive', 'market research'],
  monitoring: ['monitor', 'monitoring', 'alert', 'watch', 'radar', 'incident', 'signal', 'tracking'],
  marketing: ['marketing', 'social', 'campaign', 'brand', 'content calendar', 'newsletter', 'performance'],
  content: ['content', 'video', 'copywriting', 'blog', 'writing', 'editorial', 'production'],
  operations: ['operations', 'ops', 'workflow', 'process', 'planning', 'brief'],
}

const LANE_COMPATIBILITY: Partial<Record<TemplateLane, TemplateLane[]>> = {
  personal: ['executive'],
  executive: ['personal', 'operations'],
  support: ['operations'],
  sales: ['marketing', 'operations'],
  research: ['executive', 'operations'],
  monitoring: ['operations', 'research'],
  marketing: ['sales', 'content'],
  content: ['marketing'],
  operations: ['executive', 'personal', 'support', 'research', 'monitoring', 'sales'],
}

export interface TemplateShortlistOptions {
  preferredMode?: GenerationMode | 'auto'
  selectedTemplateSlug?: string
  draft?: GenerationDraft
  limit?: number
}

export function shortlistTemplates(
  templates: TemplateCatalogEntry[],
  prompt: string,
  options: TemplateShortlistOptions = {},
): TemplateMatch[] {
  const limit = options.limit ?? 8
  const normalizedPrompt = normalizeText(prompt)
  const tokens = tokenize(normalizedPrompt)
  const profile = detectBuilderIntentProfile(prompt)
  const promptLanes = detectPromptLanes(normalizedPrompt, profile?.id)

  const scored = templates.map((template) => {
    let score = 0
    const reasons: string[] = []
    const templateHints = getTemplateRecommendationHintsBySlug(template.slug)
    const templateLanes = detectTemplateLanes(template, templateHints)

    if (options.selectedTemplateSlug && template.slug === options.selectedTemplateSlug) {
      score += 0.28
      reasons.push('already selected in the current flow')
    }

    if (options.preferredMode && options.preferredMode !== 'auto') {
      const preferredKind = options.preferredMode === 'blank-team' ? 'team' : 'agent'
      if (template.kind === preferredKind) {
        score += 0.1
      }
    }

    const haystacks = [
      template.name,
      template.description ?? '',
      template.category,
      template.preview_prompt ?? '',
      ...template.tags,
      ...(templateHints?.intentKeywords ?? []),
    ].map((value) => normalizeText(value))

    const laneScore = scoreLaneAlignment(promptLanes, templateLanes)
    if (laneScore !== 0) {
      score += laneScore
      if (laneScore > 0) {
        reasons.push(`fits the ${Array.from(promptLanes)[0] ?? 'expected'} lane`)
      } else {
        reasons.push(`demoted for the wrong ${Array.from(promptLanes)[0] ?? 'intent'} lane`)
      }
    }

    const antiKeywordMatches = (templateHints?.antiKeywords ?? []).filter((keyword) =>
      normalizedPrompt.includes(normalizeText(keyword)),
    )
    if (antiKeywordMatches.length > 0) {
      score -= Math.min(0.2, antiKeywordMatches.length * 0.08)
      reasons.push('prompt conflicts with this template intent')
    }

    const matchedTokens = new Set<string>()
    for (const token of tokens) {
      if (haystacks.some((value) => value.includes(token))) {
        matchedTokens.add(token)
      }
    }

    if (matchedTokens.size > 0) {
      score += Math.min(0.42, matchedTokens.size * 0.08)
      reasons.push(`matched ${matchedTokens.size} prompt terms`)
    }

    if (template.category && normalizedPrompt.includes(template.category.toLowerCase())) {
      score += 0.12
      reasons.push(`category fits ${template.category}`)
    }

    if (template.kind === 'team' && /\bteam|handoff|review|reviewer|coordinator|specialist|pipeline\b/.test(normalizedPrompt)) {
      score += 0.12
      reasons.push('prompt implies coordinated roles')
    }

    if (
      template.kind === 'agent'
      && [...promptLanes].some((lane) => templateLanes.has(lane))
      && /\bpersonal|single|assistant|copilot|support|sales|research\b/.test(normalizedPrompt)
    ) {
      score += 0.04
    }

    const profileTemplateScore = scoreTemplateKeywords(
      profile,
      [
        template.name,
        template.description ?? '',
        template.category,
        template.preview_prompt ?? '',
        ...(templateHints?.intentKeywords ?? []),
        ...(template.tags ?? []),
      ].map((value) => normalizeText(value)).join(' '),
    )
    if (profileTemplateScore > 0) {
      score += Math.min(0.18, profileTemplateScore * 0.06)
      reasons.push(`fits the ${profile?.label.toLowerCase()} profile`)
    }

    const requiredParamLabels = (template.params ?? [])
      .filter((param) => param.required)
      .map((param) => `${param.key} ${param.label} ${param.hint ?? ''}`.toLowerCase())
    const matchedParamTerms = requiredParamLabels.filter((value) => tokens.some((token) => value.includes(token)))
    if (matchedParamTerms.length > 0) {
      score += Math.min(0.12, matchedParamTerms.length * 0.04)
      reasons.push('prompt mentions likely template inputs')
    }

    if (template.install_count > 0) {
      score += Math.min(0.08, Math.log10(template.install_count + 1) / 20)
    }

    return {
      slug: template.slug,
      name: template.name,
      kind: template.kind,
      score: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
      reason: reasons.join('; ') || 'general fit',
      missing_params: [],
    } satisfies TemplateMatch
  })

  return scored
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit)
}

function tokenize(value: string): string[] {
  return [...new Set(
    value
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
  )]
}

function normalizeText(value: string): string {
  return normalizeBuilderText(
    value.toLowerCase()
      .replace(/\be-mails?\b/gu, 'email')
      .replace(/\bceo's\b/gu, 'ceo'),
  )
}

function detectPromptLanes(normalizedPrompt: string, profileId?: string): Set<TemplateLane> {
  const lanes = scoreLanes(normalizedPrompt)

  if (profileId === 'personal-agent') lanes.add('personal')
  if (profileId === 'executive-assistant') lanes.add('executive')
  if (profileId === 'support-agent') lanes.add('support')
  if (profileId === 'sales-agent') lanes.add('sales')
  if (profileId === 'research-agent') lanes.add('research')

  return lanes
}

function detectTemplateLanes(
  template: Pick<TemplateCatalogEntry, 'name' | 'description' | 'category' | 'preview_prompt' | 'tags'>,
  templateHints: ReturnType<typeof getTemplateRecommendationHintsBySlug>,
): Set<TemplateLane> {
  const lanes = new Set<TemplateLane>()
  if (templateHints?.archetype) lanes.add(templateHints.archetype)

  const inferred = scoreLanes(normalizeText([
    template.name,
    template.description ?? '',
    template.category,
    template.preview_prompt ?? '',
    ...(template.tags ?? []),
    ...(templateHints?.intentKeywords ?? []),
  ].join(' ')))

  for (const lane of inferred) lanes.add(lane)

  if (lanes.size === 0 && template.category.toLowerCase() === 'productivity') {
    lanes.add('personal')
  }

  return lanes
}

function scoreLanes(normalizedText: string): Set<TemplateLane> {
  const laneScores = Object.entries(LANE_KEYWORDS)
    .map(([lane, keywords]) => ({
      lane: lane as TemplateLane,
      score: keywords.reduce((total, keyword) => total + (normalizedText.includes(keyword) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (laneScores.length === 0) return new Set<TemplateLane>()

  const topScore = laneScores[0]?.score ?? 0
  return new Set(
    laneScores
      .filter((entry) => entry.score >= Math.max(1, topScore - 1))
      .map((entry) => entry.lane),
  )
}

function scoreLaneAlignment(promptLanes: Set<TemplateLane>, templateLanes: Set<TemplateLane>): number {
  if (promptLanes.size === 0 || templateLanes.size === 0) return 0

  const directMatch = [...promptLanes].some((lane) => templateLanes.has(lane))
  if (directMatch) return 0.26

  const compatibleMatch = [...promptLanes].some((lane) =>
    (LANE_COMPATIBILITY[lane] ?? []).some((compatibleLane) => templateLanes.has(compatibleLane)),
  )
  if (compatibleMatch) return 0.08

  return -0.24
}
