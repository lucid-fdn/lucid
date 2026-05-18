import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import {
  addOperatorAllowedOrigin,
  listOperatorAllowedOrigins,
} from '@/lib/app-service/public-access-management'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../_shared'

export const dynamic = 'force-dynamic'

const AddOriginSchema = z.object({
  origin: z.string().trim().min(1).max(500),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'read')
    const origins = await listOperatorAllowedOrigins(app.id)
    return runtimeRouteOk({ origins }, request)
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
    const body = AddOriginSchema.parse(await readRuntimeJsonBody(request))
    const origin = await addOperatorAllowedOrigin({
      appDeploymentId: app.id,
      origin: body.origin,
      userId,
    })
    return runtimeRouteOk({ origin }, request, { status: 201 })
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
