import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import {
  createOperatorPublicToken,
  listOperatorPublicTokens,
} from '@/lib/app-service/public-access-management'
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
    const tokens = await listOperatorPublicTokens(app.id)
    return runtimeRouteOk({ tokens }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
}

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app, userId } = await requireOperatorAppAccess(appId, 'write')
    const token = await createOperatorPublicToken({
      appDeploymentId: app.id,
      input: await readRuntimeJsonBody(request),
      userId,
    })
    return runtimeRouteOk({ token }, request, { status: 201 })
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
