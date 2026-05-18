export function normalizeProviderSecret(raw?: string | null): string | undefined {
  if (typeof raw !== 'string') return undefined
  const normalized = raw.replace(/\\n/g, '').replace(/\r?\n/g, '').trim()
  if (!normalized || normalized === 'your-key-here') return undefined
  return normalized
}

export function normalizeProviderBaseUrl(raw?: string | null): string | undefined {
  if (typeof raw !== 'string') return undefined
  const normalized = raw.replace(/\\n/g, '').replace(/\r?\n/g, '').trim().replace(/\/+$/, '')
  return normalized || undefined
}

export function parseProviderFlag(raw?: string | boolean | number | null): boolean {
  if (raw == null || raw === '') return false
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const normalized = raw.trim().toLowerCase()
  return ['true', '1', 'yes', 'on'].includes(normalized)
}

export function isDirectOpenAIFallbackEnabled(): boolean {
  return (
    parseProviderFlag(process.env.AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED) ||
    parseProviderFlag(process.env.AI_TEXT_DIRECT_OPENAI_FALLBACK_ENABLED) ||
    parseProviderFlag(process.env.AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED)
  )
}

export function isDirectOpenAIBaseUrl(raw?: string | null): boolean {
  const normalized = normalizeProviderBaseUrl(raw)?.toLowerCase()
  return Boolean(normalized && normalized.includes('api.openai.com') && !normalized.includes('lucid'))
}

export function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

export function resolveProviderOverride<T extends string>(
  rawValue: string | undefined,
  supported: readonly T[],
  fallback: T,
): T {
  const normalized = rawValue?.trim().toLowerCase()
  return supported.find((value) => value === normalized) ?? fallback
}
