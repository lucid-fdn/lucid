import 'server-only'

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
