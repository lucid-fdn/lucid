import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { enqueueAppTeamRun } from '@/lib/app-service/runtime-gateway/teams'
import {
  readRuntimeJsonBody,
  requireOperatorAppAccess,
  requireRuntimeSurfaces,
  runtimeRouteError,
  runtimeRouteOk,
} from '../../../../../_shared'

export const dynamic = 'force-dynamic'

const TeamRunRequestSchema = z.object({
  teamKey: z.string().min(1).max(80).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().max(160).optional(),
})

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) => {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'write')
    const body = TeamRunRequestSchema.parse(await readRuntimeJsonBody(request))
    const result = await enqueueAppTeamRun(app.id, body)
    return runtimeRouteOk({ run: result }, request, { status: 202 })
  } catch (error) {
    return runtimeRouteError(error, request)
  }
})
