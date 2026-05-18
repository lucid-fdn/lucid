import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { removeOperatorAllowedOrigin } from '@/lib/app-service/public-access-management'
import {
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../../_shared'

export const dynamic = 'force-dynamic'

export const DELETE = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; originId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId, originId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'write')
    await removeOperatorAllowedOrigin({ appDeploymentId: app.id, originId })
    return runtimeRouteOk({ origin: { id: originId, removed: true } }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
