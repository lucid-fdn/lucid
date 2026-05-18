import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { processQueuedAppGenerationRuns } from '@/lib/app-service/generation-service'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireFoundrySurface,
  requireOrgAccess,
} from '../../_shared'

export const dynamic = 'force-dynamic'

const ProcessNextSchema = z.object({
  orgId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional(),
})

export const POST = withCSRF(async (request: NextRequest) => {
  try {
    requireFoundrySurface()
    const body = ProcessNextSchema.parse(await readAppServiceJsonBody(request))
    await requireOrgAccess(body.orgId, 'write')
    const result = await processQueuedAppGenerationRuns({
      orgId: body.orgId,
      limit: body.limit,
    })
    return appServicesOk(result, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
