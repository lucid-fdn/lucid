import { NextRequest } from 'next/server'
import { listAppIntegrationStatuses } from '@/lib/app-service/runtime-gateway/integrations'
import { requireOperatorAppAccess, requireRuntimeSurfaces, runtimeRouteError, runtimeRouteOk } from '../../../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'read')
    const integrations = await listAppIntegrationStatuses(app.id)
    return runtimeRouteOk({ integrations }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
}
