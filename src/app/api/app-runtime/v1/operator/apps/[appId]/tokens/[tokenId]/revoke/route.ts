import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { revokeOperatorPublicToken } from '@/lib/app-service/public-access-management'
import {
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
    const { app } = await requireOperatorAppAccess(appId, 'write')
    await revokeOperatorPublicToken({ appDeploymentId: app.id, tokenId })
    return runtimeRouteOk({ token: { id: tokenId, revoked: true } }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
