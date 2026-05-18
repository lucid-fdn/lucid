import 'server-only'

import {
  appServiceErrorResponse,
  appServiceOk,
} from './api'
import { getRequestIdentifier } from '@/lib/auth/rate-limit'
import { AppServiceError } from './errors'
import { withGeneratedAppCorsHeaders } from './cors'
import {
  buildPublicRuntimeAccess,
  type PublicRuntimeAccess,
  type PublicRuntimeRequestKind,
} from './public-runtime-core'
import { assertPublicRuntimeOriginAllowed } from './runtime-gateway/public'

export function publicRuntimeAccess(
  request: Request,
  kind: PublicRuntimeRequestKind,
  countRequest?: boolean,
): PublicRuntimeAccess {
  return buildPublicRuntimeAccess(request, kind, countRequest, {
    requestIdentifier: getRequestIdentifier(request),
  })
}

export function publicRuntimeOk<T>(
  data: T,
  reqId: string,
  access: PublicRuntimeAccess,
  init?: ResponseInit,
) {
  return withGeneratedAppCorsHeaders(appServiceOk(data, reqId, init), access.origin)
}

export function publicRuntimeErrorResponse(
  error: unknown,
  reqId: string,
  access: PublicRuntimeAccess,
) {
  const response = appServiceErrorResponse(error, reqId)
  if (error instanceof AppServiceError && error.code === 'origin_not_allowed') {
    return response
  }
  return withGeneratedAppCorsHeaders(response, access.origin)
}

export function publicRuntimeResponse(
  response: Response,
  access: PublicRuntimeAccess,
) {
  return withGeneratedAppCorsHeaders(response, access.origin)
}

export async function publicRuntimeOptionsResponse(
  slug: string,
  request: Request,
) {
  const access = publicRuntimeAccess(request, 'preflight', false)
  await assertPublicRuntimeOriginAllowed(slug, access)
  return withGeneratedAppCorsHeaders(new Response(null, { status: 204 }), access.origin)
}
