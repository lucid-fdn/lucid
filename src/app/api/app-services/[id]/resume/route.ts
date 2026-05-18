import { NextRequest } from 'next/server'
import { OperatorResumeRequestSchema } from '@contracts/app-runtime'
import { withCSRF } from '@/lib/auth/csrf'
import { resumeAppDeployment } from '@/lib/app-service/deployments'
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
    const body = OperatorResumeRequestSchema.parse(await readAppServiceJsonBody(request))
    const resumed = await resumeAppDeployment({ app, userId, note: body.note, status: body.status })
    return appServicesOk({ app: resumed }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
