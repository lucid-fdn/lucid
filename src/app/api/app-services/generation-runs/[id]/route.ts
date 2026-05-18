import { NextRequest } from 'next/server'
import { getAppGenerationRun } from '@/lib/app-service/generation-service'
import { AppServiceError } from '@/lib/app-service/errors'
import {
  appServicesError,
  appServicesOk,
  requireFoundrySurface,
  requireOrgAccess,
} from '../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireFoundrySurface()
    const { id } = await params
    const run = await getAppGenerationRun(id)
    if (!run) {
      throw new AppServiceError('not_found', 'App generation run was not found.', 404)
    }
    await requireOrgAccess(run.org_id, 'read')
    return appServicesOk({ run }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
}
