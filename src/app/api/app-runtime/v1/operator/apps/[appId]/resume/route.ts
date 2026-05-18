import { NextRequest } from 'next/server'
import { OperatorResumeRequestSchema } from '@contracts/app-runtime'
import { withCSRF } from '@/lib/auth/csrf'
import { resumeAppDeployment } from '@/lib/app-service/deployments'
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
    const body = OperatorResumeRequestSchema.parse(await readRuntimeJsonBody(request))
    const resumed = await resumeAppDeployment({ app, userId, note: body.note, status: body.status })
    return runtimeRouteOk({ app: resumed }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
