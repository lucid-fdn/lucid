import 'server-only'

export function isDeploymentLevelUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /unavailable in this deployment/i.test(error.message)
}
