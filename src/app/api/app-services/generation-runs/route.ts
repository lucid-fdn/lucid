import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import {
  CreateAppGenerationRunInputSchema,
  createAppGenerationRun,
} from '@/lib/app-service/generation-service'
import { AppGenerationRunSchema } from '@contracts/app-service'
import { supabase } from '@/lib/db/client'
import { APP_GENERATION_RUN_SELECT } from '@/lib/app-service/projections'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireFoundrySurface,
  requireOrgAccess,
} from '../_shared'

export const dynamic = 'force-dynamic'

const GenerationRunsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  status: z.string().max(80).optional(),
})

export async function GET(request: NextRequest) {
  try {
    requireFoundrySurface()
    const query = GenerationRunsQuerySchema.parse({
      org_id: request.nextUrl.searchParams.get('org_id') ?? undefined,
      project_id: request.nextUrl.searchParams.get('project_id') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    })
    await requireOrgAccess(query.org_id, 'read')

    let builder = supabase
      .from('app_generation_runs')
      .select(APP_GENERATION_RUN_SELECT)
      .eq('org_id', query.org_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (query.project_id) builder = builder.eq('project_id', query.project_id)
    if (query.status) builder = builder.eq('status', query.status)

    const { data, error } = await builder
    if (error) throw error

    return appServicesOk({
      runs: (data ?? []).map((row) => AppGenerationRunSchema.parse(row)),
    }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
}

export const POST = withCSRF(async (request: NextRequest) => {
  try {
    requireFoundrySurface()
    const input = CreateAppGenerationRunInputSchema.parse(await readAppServiceJsonBody(request))
    const { userId } = await requireOrgAccess(input.orgId, 'write')
    const run = await createAppGenerationRun(input, userId)
    return appServicesOk({ run }, request, { status: 201 })
  } catch (error) {
    return appServicesError(error, request)
  }
})
