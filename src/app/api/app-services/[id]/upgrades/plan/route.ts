import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { planAppBlueprintUpgrade } from '@/lib/app-service/blueprint-upgrades'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireAppAccess,
  requireFoundrySurface,
} from '../../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    requireFoundrySurface()
    const { id } = await params
    const { app } = await requireAppAccess(id, 'read')
    const plan = await planAppBlueprintUpgrade({
      app,
      input: await readAppServiceJsonBody(request),
    })
    return appServicesOk({ plan }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
