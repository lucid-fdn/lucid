export const DEFAULT_AGENT_MODEL_ID = 'lucid-auto'

const MODEL_HINTS: Record<string, string> = {
  auto: DEFAULT_AGENT_MODEL_ID,
  default: DEFAULT_AGENT_MODEL_ID,
  fast: 'openai/gpt-4.1-mini',
  strong: 'openai/gpt-4.1',
}

export function resolveAgentModel(input?: string | null): string {
  const normalized = input?.trim()
  if (!normalized) return DEFAULT_AGENT_MODEL_ID
  return MODEL_HINTS[normalized.toLowerCase()] ?? normalized
}
