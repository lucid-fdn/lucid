import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AppServiceSpecSchema } from '@contracts/app-service'
import { withCSRF } from '@/lib/auth/csrf'
import {
  approveAppGenerationRun,
  getAppGenerationRun,
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

const ApproveGenerationRunSchema = z.object({
  spec: AppServiceSpecSchema.optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
})

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
    const { userId } = await requireGenerationRunControl(run, 'approve')
    const body = ApproveGenerationRunSchema.parse(await readAppServiceJsonBody(request))
    const result = await approveAppGenerationRun({
      run,
      spec: body.spec,
      userId,
      visibility: body.visibility,
    })
    return appServicesOk(result, request, { status: 201 })
  } catch (error) {
    return appServicesError(error, request)
  }
})
