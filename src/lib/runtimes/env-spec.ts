import 'server-only'

export type RuntimeEnvValue = string | boolean | number | null | undefined

export type RuntimeEnvSpec = Record<string, RuntimeEnvValue>

export function trimRuntimeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function serializeRuntimeEnvSpec(spec: RuntimeEnvSpec): Record<string, string> {
  const serialized: Record<string, string> = {}

  for (const [key, value] of Object.entries(spec)) {
    if (value == null) continue

    if (typeof value === 'boolean') {
      serialized[key] = value ? 'true' : 'false'
      continue
    }

    serialized[key] = String(value)
  }

  return serialized
}
