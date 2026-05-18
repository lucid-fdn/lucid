import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import {
  getAppGenerationRun,
  requeueFailedAppGenerationRun,
} from '@/lib/app-service/generation-service'
import { AppServiceError } from '@/lib/app-service/errors'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireFoundrySurface,
  requireGenerationRunControl,
} from '../../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    requireFoundrySurface()
    const { id } = await params
    const run = await getAppGenerationRun(id)
    if (!run) {
      throw new AppServiceError('not_found', 'App generation run was not found.', 404)
    }
    const { userId } = await requireGenerationRunControl(run, 'requeue')
    const requeued = await requeueFailedAppGenerationRun({
      run,
      userId,
      input: await readAppServiceJsonBody(request),
    })
    return appServicesOk({ run: requeued }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
