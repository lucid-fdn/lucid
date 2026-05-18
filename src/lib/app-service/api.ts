import { NextResponse } from 'next/server'
import type { AppServiceSurface } from './feature-gates'
import { assertAppServiceSurfacesEnabled } from './feature-gates'
import { AppServiceError, requestId, toApiErrorEnvelope } from './errors'

export function requestIdFromRequest(request: Request): string {
  return request.headers.get('x-request-id') ?? requestId()
}

export function appServiceOk<T>(
  data: T,
  reqId: string,
  init?: ResponseInit,
) {
  return NextResponse.json(
    {
      data,
      meta: {
        request_id: reqId,
        app_runtime_api_version: 'v1',
      },
    },
    init,
  )
}

export function appServiceErrorResponse(error: unknown, reqId: string) {
  const normalized = error instanceof AppServiceError
    ? error
    : new AppServiceError(
      'internal_error',
      error instanceof Error ? error.message : 'Internal error',
      500,
    )

  return NextResponse.json(toApiErrorEnvelope(normalized, reqId), {
    status: normalized.status,
  })
}

export function guardAppServiceSurfaces(
  surfaces: AppServiceSurface[],
  request: Request,
): NextResponse | null {
  const reqId = requestIdFromRequest(request)
  try {
    assertAppServiceSurfacesEnabled(surfaces)
    return null
  } catch (error) {
    return appServiceErrorResponse(error, reqId)
  }
}
