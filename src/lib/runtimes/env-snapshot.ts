import 'server-only'

import type { DedicatedRuntime } from '@/lib/mission-control/types'

const SENSITIVE_KEY_PATTERNS = [
  /KEY/i,
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /DSN/i,
  /JWT/i,
]

function isSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

export function buildRuntimeEnvSnapshot(
  envVars: Record<string, string>,
  timestamp = new Date().toISOString(),
): NonNullable<DedicatedRuntime['envSnapshot']> {
  const snapshot: NonNullable<DedicatedRuntime['envSnapshot']> = {}

  for (const [key, value] of Object.entries(envVars)) {
    const masked = isSensitiveEnvKey(key)
    snapshot[key] = {
      present: value.length > 0,
      updatedAt: timestamp,
      masked,
      ...(masked ? {} : { valuePreview: value.slice(0, 64) }),
    }
  }

  return snapshot
}
