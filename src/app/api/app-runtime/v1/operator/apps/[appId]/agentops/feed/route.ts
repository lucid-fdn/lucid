import { NextRequest } from 'next/server'
import { listAppAgentOpsFeed } from '@/lib/app-service/runtime-gateway/agentops'
import { requireOperatorAppAccess, requireRuntimeSurfaces, runtimeRouteError, runtimeRouteOk } from '../../../../../_shared'

export const dynamic = 'force-dynamic'

function readLimit(request: NextRequest) {
  const parsed = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    requireRuntimeSurfaces()
    const { appId } = await params
    const { app } = await requireOperatorAppAccess(appId, 'read')
    const feed = await listAppAgentOpsFeed(app.id, {
      orgId: app.org_id,
      generationRunId: app.generation_run_id,
      assistantIds: app.assistant_ids,
      limit: readLimit(request),
    })
    return runtimeRouteOk({ feed }, request)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
}
