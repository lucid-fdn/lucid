import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { updateAppDeploymentSettings } from '@/lib/app-service/deployments'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireAppAccess,
  requireFoundrySurface,
} from '../../_shared'

export const dynamic = 'force-dynamic'

export const PATCH = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    requireFoundrySurface()
    const { id } = await params
    const { app, userId } = await requireAppAccess(id, 'write')
    const updated = await updateAppDeploymentSettings({
      app,
      input: await readAppServiceJsonBody(request),
      userId,
    })
    return appServicesOk({ app: updated }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
