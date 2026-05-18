import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import {
  cancelAppGenerationRun,
  getAppGenerationRun,
} from '@/lib/app-service/generation-service'
import { AppServiceError } from '@/lib/app-service/errors'
import {
  appServicesError,
  appServicesOk,
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
    await requireGenerationRunControl(run, 'cancel')
    const cancelled = await cancelAppGenerationRun(run)
    return appServicesOk({ run: cancelled }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
