import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { rotateOperatorPublicToken } from '@/lib/app-service/public-access-management'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; tokenId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId, tokenId } = await params
    const { app, userId } = await requireOperatorAppAccess(appId, 'write')
    const token = await rotateOperatorPublicToken({
      appDeploymentId: app.id,
      tokenId,
      input: await readRuntimeJsonBody(request),
      userId,
    })
    return runtimeRouteOk({ token, revoked_token_id: tokenId }, request, { status: 201 })
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
