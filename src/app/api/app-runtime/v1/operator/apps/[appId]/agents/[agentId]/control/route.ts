import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { controlAppAgent } from '@/lib/app-service/runtime-gateway/control-plane'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; agentId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId, agentId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'write')
    const result = await controlAppAgent(app.id, agentId, await readRuntimeJsonBody(request))
    return runtimeRouteOk({ result }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
