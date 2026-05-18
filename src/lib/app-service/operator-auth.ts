import 'server-only'

import type { AppDeployment, AppGenerationRun } from '@contracts/app-service'
import { getOrgMemberRole } from '@/lib/db'
import { getAppDeployment } from './deployments'
import { AppServiceError } from './errors'
import {
  type AppServiceAccessLevel,
  canAccessAppServiceOrg,
  canControlAppServiceGenerationRun,
} from './operator-auth-core'

export interface AppServiceOperatorAccessResult {
  role: string
}

export async function requireAppServiceOrgMembership(
  userId: string,
  orgId: string,
): Promise<AppServiceOperatorAccessResult> {
  const role = await getOrgMemberRole(userId, orgId)
  if (!canAccessAppServiceOrg(role, 'read')) {
    throw new AppServiceError('forbidden', 'Organization membership required.', 403)
  }
  return { role: role! }
}

export async function requireAppServiceOrgWriteAccess(
  userId: string,
  orgId: string,
): Promise<AppServiceOperatorAccessResult> {
  const role = await getOrgMemberRole(userId, orgId)
  if (!canAccessAppServiceOrg(role, 'write')) {
    throw new AppServiceError('forbidden', 'Admin or owner role required.', 403)
  }
  return { role: role! }
}

export async function requireAppServiceAppAccess(params: {
  userId: string
  app: AppDeployment
  access: AppServiceAccessLevel
}): Promise<AppServiceOperatorAccessResult> {
  return params.access === 'write'
    ? requireAppServiceOrgWriteAccess(params.userId, params.app.org_id)
    : requireAppServiceOrgMembership(params.userId, params.app.org_id)
}

export async function loadAppServiceAppForOperatorAccess(params: {
  userId: string
  appId: string
  access: AppServiceAccessLevel
}): Promise<{ app: AppDeployment; role: string }> {
  const app = await getAppDeployment(params.appId)
  if (!app) {
    throw new AppServiceError('not_found', 'Generated app was not found.', 404)
  }

  const { role } = await requireAppServiceAppAccess({
    userId: params.userId,
    app,
    access: params.access,
  })
  return { app, role }
}

export async function requireAppServiceGenerationRunControlAccess(params: {
  userId: string
  run: Pick<AppGenerationRun, 'org_id' | 'created_by'>
  action: string
}): Promise<AppServiceOperatorAccessResult> {
  const role = await getOrgMemberRole(params.userId, params.run.org_id)
  if (!canControlAppServiceGenerationRun({
    userId: params.userId,
    createdBy: params.run.created_by,
    role,
  })) {
    throw new AppServiceError(
      'forbidden',
      `Only the creator, admin, or owner can ${params.action} this run.`,
      403,
    )
  }
  return { role: role ?? 'creator' }
}
