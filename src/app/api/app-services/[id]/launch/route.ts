import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { launchAppDeployment } from '@/lib/app-service/deployments'
import { getAppServiceOperatorVisibility } from '@/lib/app-service/operator-visibility'
import { AppServiceError } from '@/lib/app-service/errors'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireAppAccess,
  requireFoundrySurface,
} from '../../_shared'

export const dynamic = 'force-dynamic'

const LaunchRequestSchema = z.object({
  visibility: z.enum(['unlisted', 'public']).optional(),
  requireReadiness: z.boolean().default(true),
  note: z.string().trim().max(2_000).optional(),
})

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    requireFoundrySurface()
    const { id } = await params
    const { app, userId } = await requireAppAccess(id, 'write')
    const body = LaunchRequestSchema.parse(await readAppServiceJsonBody(request))

    if (body.requireReadiness) {
      const visibility = await getAppServiceOperatorVisibility(app)
      if (visibility.launch_readiness.status === 'blocked') {
        throw new AppServiceError(
          'validation_failed',
          'App launch readiness is blocked.',
          409,
          { details: { blockers: visibility.launch_readiness.blockers } },
        )
      }
    }

    const launched = await launchAppDeployment({
      app,
      userId,
      visibility: body.visibility,
      note: body.note,
    })
    return appServicesOk({ app: launched }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
