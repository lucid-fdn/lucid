import { NextRequest } from 'next/server'
import { OperatorLifecycleRequestSchema } from '@contracts/app-runtime'
import { withCSRF } from '@/lib/auth/csrf'
import { pauseAppDeployment } from '@/lib/app-service/deployments'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireAppAccess,
  requireFoundrySurface,
} from '../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    requireFoundrySurface()
    const { id } = await params
    const { app, userId } = await requireAppAccess(id, 'write')
    const body = OperatorLifecycleRequestSchema.parse(await readAppServiceJsonBody(request))
    const paused = await pauseAppDeployment({ app, userId, note: body.note })
    return appServicesOk({ app: paused }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
