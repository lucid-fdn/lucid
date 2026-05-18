import type { TemplateCatalogEntry } from '@contracts/template'

import { getTemplateRecommendationHintsBySlug } from '@/lib/templates/registry'

import { detectBuilderIntentProfile } from './intent-profiles'
import { shortlistTemplates } from './template-shortlist'
import type { TemplateMatch } from './schemas'

const MIN_TEMPLATE_SUGGESTION_SCORE = 0.72
const MIN_PROFILE_TEMPLATE_SUGGESTION_SCORE = 0.45

export interface BuilderTemplateSuggestion {
  match: TemplateMatch
  reason: string
  confidence: number
}

export function suggestBuilderTemplate(input: {
  prompt: string
  templates: TemplateCatalogEntry[]
  selectedTemplateSlug?: string | null
}): BuilderTemplateSuggestion | null {
  const profile = detectBuilderIntentProfile(input.prompt)
  const matches = shortlistTemplates(input.templates, input.prompt, {
    preferredMode: 'auto',
    selectedTemplateSlug: input.selectedTemplateSlug ?? undefined,
    limit: 6,
  })

  const platformTemplates = new Map(
    input.templates
      .filter((template) => template.source === 'platform' && template.owner_org_id === null)
      .map((template) => [template.slug, template] as const),
  )

  for (const match of matches) {
    const template = platformTemplates.get(match.slug)
    if (!template || template.kind !== 'agent') continue

    const hints = getTemplateRecommendationHintsBySlug(template.slug)
    if (profile) {
      if (hints?.archetype !== profile.archetype) continue
      if (match.score < MIN_PROFILE_TEMPLATE_SUGGESTION_SCORE) continue
    } else if (match.score < MIN_TEMPLATE_SUGGESTION_SCORE) {
      continue
    }
    if (!profile && !hints?.archetype) continue

    return {
      match,
      confidence: match.score,
      reason: match.reason,
    }
  }

  return null
}
