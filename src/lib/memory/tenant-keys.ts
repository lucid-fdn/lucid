export const ANON_USER_SUFFIX = '__anon__'

export function buildTenantKey(orgId: string | null | undefined, projectId?: string | null, envId?: string | null) {
  const org = orgId || '__global__'
  const project = projectId || 'default'
  const env = envId || 'default'
  return `${org}:${project}:${env}`
}

export function buildScopedUserId(
  orgId: string | null | undefined,
  externalUserId: string | null | undefined,
  projectId?: string | null,
  envId?: string | null,
) {
  const user = externalUserId || ANON_USER_SUFFIX
  return `${buildTenantKey(orgId, projectId, envId)}:${user}`
}
