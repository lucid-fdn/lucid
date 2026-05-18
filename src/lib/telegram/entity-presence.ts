import type { ChatBinding } from './inline-keyboards'

export interface TelegramPersona {
  displayName: string
  roleTitle: string
  essence: string
  signature: string
  starterPrompts: string[]
}

export interface TelegramPersonaOverrides {
  displayName?: string | null
  roleTitle?: string | null
  essence?: string | null
  starterPrompts?: string[] | null
}

const GENERIC_PROMPTS = [
  'What do you do best?',
  'Help me figure out the next move.',
  'Start with the highest-leverage step.',
]

function firstNonEmptyLine(text: string | null | undefined): string | null {
  if (!text) return null
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return null
}

function firstSentence(text: string | null | undefined): string | null {
  const line = firstNonEmptyLine(text)
  if (!line) return null
  const idx = line.search(/[.!?](\s|$)/)
  if (idx === -1) return line
  return line.slice(0, idx + 1).trim()
}

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function inferRoleTitle(name: string, description?: string | null): string {
  const haystack = `${name} ${description ?? ''}`.toLowerCase()
  if (/\bcloser|close|sales|lead\b/.test(haystack)) return 'Lead Conversion Specialist'
  if (/\banalyst|research|intel|insight\b/.test(haystack)) return 'Research Intelligence Entity'
  if (/\bschedule|calendar|ops|coordinate\b/.test(haystack)) return 'Coordination Entity'
  if (/\bwriter|copy|content|brand\b/.test(haystack)) return 'Creative Language Entity'
  if (/\bcoach|mentor|strategy|advisor\b/.test(haystack)) return 'Strategic Guidance Entity'

  const line = firstNonEmptyLine(description)
  if (line && line.length <= 54) return line
  return 'Lucid Living Entity'
}

function inferEssence(name: string, description?: string | null): string {
  const sentence = firstSentence(description)
  if (sentence) return truncate(sentence, 160)
  return `${name} is one of Lucid's living agents, ready to think and act with you.`
}

function inferStarterPrompts(name: string, description?: string | null): string[] {
  const haystack = `${name} ${description ?? ''}`.toLowerCase()
  if (/\bcloser|close|sales|lead\b/.test(haystack)) {
    return [
      'Draft a strong follow-up for a warm lead.',
      'Handle an objection and keep the deal alive.',
      'Give me the best closing move right now.',
    ]
  }
  if (/\banalyst|research|intel|insight\b/.test(haystack)) {
    return [
      'Research this company and tell me what matters.',
      'Give me the sharpest insight on this situation.',
      'Summarize the signal and the risk.',
    ]
  }
  if (/\bschedule|calendar|ops|coordinate\b/.test(haystack)) {
    return [
      'Organize the next steps for me.',
      'Turn this into a clean plan.',
      'Help me coordinate the timeline.',
    ]
  }
  return GENERIC_PROMPTS
}

export function buildTelegramPersona(input: {
  name: string
  description?: string | null
  overrides?: TelegramPersonaOverrides
}): TelegramPersona {
  const displayName = input.overrides?.displayName?.trim() || input.name.trim() || 'Untitled agent'
  const roleTitle = input.overrides?.roleTitle?.trim() || inferRoleTitle(displayName, input.description)
  const essence = input.overrides?.essence?.trim() || inferEssence(displayName, input.description)
  const starterPrompts =
    input.overrides?.starterPrompts?.map((prompt) => prompt.trim()).filter(Boolean) ||
    inferStarterPrompts(displayName, input.description)

  return {
    displayName,
    roleTitle,
    essence,
    signature: `${displayName} • Lucid`,
    starterPrompts,
  }
}

export function personaFromBinding(
  binding: Pick<
    ChatBinding,
    | 'assistant_name'
    | 'assistant_description'
    | 'assistant_role_title'
    | 'assistant_essence'
    | 'assistant_starter_prompts'
  >,
): TelegramPersona {
  return buildTelegramPersona({
    name: binding.assistant_name,
    description: binding.assistant_description,
    overrides: {
      roleTitle: binding.assistant_role_title,
      essence: binding.assistant_essence,
      starterPrompts: binding.assistant_starter_prompts,
    },
  })
}
