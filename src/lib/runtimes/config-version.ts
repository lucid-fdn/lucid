import crypto from 'crypto'

/**
 * Stable config fingerprint for managed runtime env payloads.
 * Used by startup bootstrap and heartbeat drift detection.
 */
export function computeConfigVersion(envVars: Record<string, string>): string {
  const sorted = JSON.stringify(
    Object.fromEntries(Object.entries(envVars).sort(([a], [b]) => a.localeCompare(b))),
  )
  return crypto.createHash('sha256').update(sorted).digest('hex')
}
