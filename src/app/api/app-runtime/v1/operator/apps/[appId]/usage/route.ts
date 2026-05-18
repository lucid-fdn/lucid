import { NextRequest } from 'next/server'
import { getOperatorUsage } from '@/lib/app-service/runtime-gateway/operator'
import { requireOperatorAppAccess, requireRuntimeSurfaces, runtimeRouteError, runtimeRouteOk } from '../../../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app, userId } = await requireOperatorAppAccess(appId, 'read')
    const usage = await getOperatorUsage(app.id, { userId, orgId: app.org_id })
    return runtimeRouteOk(usage, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
}
