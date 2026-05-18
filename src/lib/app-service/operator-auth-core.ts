export const APP_SERVICE_WRITE_ROLES = new Set(['owner', 'admin'])

export type AppServiceAccessLevel = 'read' | 'write'

export interface GenerationRunControlPolicyInput {
  userId: string
  createdBy: string | null | undefined
  role: string | null | undefined
}

export function canReadAppServiceOrg(role: string | null | undefined): boolean {
  return Boolean(role)
}

export function canWriteAppServiceOrg(role: string | null | undefined): boolean {
  return Boolean(role && APP_SERVICE_WRITE_ROLES.has(role))
}

export function canAccessAppServiceOrg(
  role: string | null | undefined,
  access: AppServiceAccessLevel,
): boolean {
  return access === 'write' ? canWriteAppServiceOrg(role) : canReadAppServiceOrg(role)
}

export function canControlAppServiceGenerationRun(input: GenerationRunControlPolicyInput): boolean {
  return input.createdBy === input.userId || canWriteAppServiceOrg(input.role)
}
