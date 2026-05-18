import { NextRequest } from 'next/server'
import { OperatorLifecycleRequestSchema } from '@contracts/app-runtime'
import { withCSRF } from '@/lib/auth/csrf'
import { pauseAppDeployment } from '@/lib/app-service/deployments'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app, userId } = await requireOperatorAppAccess(appId, 'write')
    const body = OperatorLifecycleRequestSchema.parse(await readRuntimeJsonBody(request))
    const paused = await pauseAppDeployment({ app, userId, note: body.note })
    return runtimeRouteOk({ app: paused }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
