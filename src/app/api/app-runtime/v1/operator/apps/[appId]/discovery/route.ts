import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import {
  getOperatorAppDiscovery,
  updateOperatorAppDiscoveryMetadata,
} from '@/lib/app-service/discovery'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'read')
    return runtimeRouteOk({ discovery: getOperatorAppDiscovery(app) }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
}

export const PATCH = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'write')
    const updated = await updateOperatorAppDiscoveryMetadata({
      app,
      input: await readRuntimeJsonBody(request),
    })
    return runtimeRouteOk({ app: updated, discovery: getOperatorAppDiscovery(updated) }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
