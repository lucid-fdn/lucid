import type { ProjectBlueprint } from '@contracts/project-blueprint'

import { createBlankAgentDraft, projectBlueprintFromDraft } from './draft'
import { detectBuilderIntentProfile } from './intent-profiles'
import { normalizeBuilderText } from './normalization'
import type { GenerationDraft } from './schemas'

const PROFILE_NAMES: Record<string, string> = {
  'personal-agent': 'Personal Assistant',
  'executive-assistant': 'Executive Assistant',
  'research-agent': 'Research Assistant',
  'sales-agent': 'Sales Assistant',
  'support-agent': 'Support Assistant',
}

export function buildOptimisticBuilderDraft(prompt: string): GenerationDraft {
  const trimmed = prompt.trim()
  const profile = detectBuilderIntentProfile(trimmed)
  const projectName = profile ? PROFILE_NAMES[profile.id] : suggestProjectName(trimmed)
  const description = profile?.description ?? `An agent that helps with: ${trimmed}`

  return createBlankAgentDraft({
    prompt: trimmed,
    projectName,
    projectDescription: description,
    starterName: projectName,
    systemPrompt: [
      `You are ${projectName} operating inside Lucid.`,
      '',
      `Purpose: ${description}`,
      '',
      `User request: ${trimmed}`,
      '',
      'Work in concise, practical steps. Ask one focused question when required information is missing.',
    ].join('\n'),
    category: profile?.id === 'personal-agent' ? 'productivity' : undefined,
    runtime: {
      mode: 'shared',
    },
  })
}

export function buildOptimisticBuilderBlueprint(prompt: string): ProjectBlueprint {
  return projectBlueprintFromDraft(buildOptimisticBuilderDraft(prompt))
}

function suggestProjectName(prompt: string): string {
  const normalized = normalizeBuilderText(prompt)
    .replace(/\b(create|build|start|make|launch|set up|setup|please|new)\b/giu, ' ')
    .replace(/\b(agent|project|bot)\b/giu, ' assistant ')
    .replace(/\s+/gu, ' ')
    .trim()

  const words = normalized
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 4)

  if (words.length === 0) return 'New Assistant'

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
