import { NextRequest } from 'next/server'
import type { AppServiceAccessLevel } from '@/lib/app-service/operator-auth-core'
import {
  appServiceErrorResponse,
  appServiceOk,
  requestIdFromRequest,
} from '@/lib/app-service/api'
import { AppServiceError } from '@/lib/app-service/errors'
import { assertAppServiceSurfacesEnabled } from '@/lib/app-service/feature-gates'
import {
  loadAppServiceAppForOperatorAccess,
  requireAppServiceGenerationRunControlAccess,
  requireAppServiceOrgMembership,
  requireAppServiceOrgWriteAccess,
} from '@/lib/app-service/operator-auth'
import type { AppGenerationRun } from '@contracts/app-service'
import { requireUserId } from '@/lib/auth/server-utils'

export const APP_SERVICE_BODY_LIMIT = 128_000

export async function readAppServiceJsonBody(
  request: NextRequest,
  maxBytes = APP_SERVICE_BODY_LIMIT,
): Promise<unknown> {
  const raw = await request.text()
  if (raw.length > maxBytes) {
    throw new AppServiceError('validation_failed', 'Request body is too large.', 413)
  }
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new AppServiceError('validation_failed', 'Invalid JSON body.', 400)
  }
}

export function requireFoundrySurface() {
  assertAppServiceSurfacesEnabled(['foundry'])
}

export function appServicesOk<T>(data: T, request: NextRequest, init?: ResponseInit) {
  return appServiceOk(data, requestIdFromRequest(request), init)
}

export function appServicesError(error: unknown, request: NextRequest) {
  return appServiceErrorResponse(error, requestIdFromRequest(request))
}

export async function requireOrgAccessFromQuery(
  request: NextRequest,
  access: AppServiceAccessLevel,
) {
  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) {
    throw new AppServiceError('validation_failed', 'org_id is required.', 400)
  }
  const userId = await requireUserId()
  const { role } = access === 'write'
    ? await requireAppServiceOrgWriteAccess(userId, orgId)
    : await requireAppServiceOrgMembership(userId, orgId)
  return { userId, orgId, role }
}

export async function requireOrgAccess(
  orgId: string,
  access: AppServiceAccessLevel,
) {
  const userId = await requireUserId()
  const { role } = access === 'write'
    ? await requireAppServiceOrgWriteAccess(userId, orgId)
    : await requireAppServiceOrgMembership(userId, orgId)
  return { userId, orgId, role }
}

export async function requireAppAccess(
  appId: string,
  access: AppServiceAccessLevel,
) {
  const userId = await requireUserId()
  const { app, role } = await loadAppServiceAppForOperatorAccess({
    userId,
    appId,
    access,
  })
  return { userId, app, role }
}

export async function requireGenerationRunControl(
  run: Pick<AppGenerationRun, 'org_id' | 'created_by'>,
  action: string,
) {
  const userId = await requireUserId()
  const { role } = await requireAppServiceGenerationRunControlAccess({
    userId,
    run,
    action,
  })
  return { userId, role }
}
