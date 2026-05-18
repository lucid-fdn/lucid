import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { rollbackAppDeploymentToArtifact } from '@/lib/app-service/deployments'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireAppAccess,
  requireFoundrySurface,
} from '../../_shared'

export const dynamic = 'force-dynamic'

const RollbackRequestSchema = z.object({
  artifactId: z.string().uuid(),
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
    const body = RollbackRequestSchema.parse(await readAppServiceJsonBody(request))
    const result = await rollbackAppDeploymentToArtifact({
      app,
      artifactId: body.artifactId,
      userId,
      note: body.note,
    })
    return appServicesOk(result, request)
  } catch (error) {
    return appServicesError(error, request)
  }
})
