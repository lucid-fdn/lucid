import { NextRequest } from 'next/server'
import { OperatorAppSettingsPatchSchema } from '@contracts/app-runtime'
import { withCSRF } from '@/lib/auth/csrf'
import { updateAppDeploymentSettings } from '@/lib/app-service/deployments'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../_shared'

export const dynamic = 'force-dynamic'

export const PATCH = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app, userId } = await requireOperatorAppAccess(appId, 'write')
    const body = OperatorAppSettingsPatchSchema.parse(await readRuntimeJsonBody(request))
    const updated = await updateAppDeploymentSettings({ app, input: body, userId })
    return runtimeRouteOk({ app: updated }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
