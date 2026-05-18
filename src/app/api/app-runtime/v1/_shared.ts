import { NextRequest, NextResponse } from 'next/server'
import type { AppServiceAccessLevel } from '@/lib/app-service/operator-auth-core'
import {
  appServiceErrorResponse,
  appServiceOk,
  requestIdFromRequest,
} from '@/lib/app-service/api'
import { AppServiceError } from '@/lib/app-service/errors'
import { assertAppServiceSurfacesEnabled } from '@/lib/app-service/feature-gates'
import { loadAppServiceAppForOperatorAccess } from '@/lib/app-service/operator-auth'
import { requireUserId } from '@/lib/auth/server-utils'

export const APP_RUNTIME_BODY_LIMIT = 64_000

export async function readRuntimeJsonBody(
  request: NextRequest,
  maxBytes = APP_RUNTIME_BODY_LIMIT,
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

export function runtimeRouteError(error: unknown, request: NextRequest) {
  return appServiceErrorResponse(error, requestIdFromRequest(request))
}

export function runtimeRouteOk<T>(
  data: T,
  request: NextRequest,
  init?: ResponseInit,
) {
  return appServiceOk(data, requestIdFromRequest(request), init)
}

export function requireRuntimeSurfaces() {
  assertAppServiceSurfacesEnabled(['runtimeApi'])
}

export function requirePublicRuntimeSurfaces() {
  assertAppServiceSurfacesEnabled(['runtimeApi', 'publicApps'])
}

export async function requireOperatorAppAccess(
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

export function noContent() {
  return new NextResponse(null, { status: 204 })
}
