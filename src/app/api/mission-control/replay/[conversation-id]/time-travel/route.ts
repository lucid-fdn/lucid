import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/replay/[conversation-id]/time-travel?org_id=xxx
// Returns turn snapshots for a run (if available)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ 'conversation-id': string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { 'conversation-id': runId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase.rpc('mc_turn_snapshots_for_run', {
      p_run_id: runId,
      p_org_id: orgId,
    })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/replay/[id]/time-travel' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
    }

    return NextResponse.json({ snapshots: data ?? [] })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/replay/[id]/time-travel' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/mission-control/replay/[conversation-id]/time-travel
// Body: { snapshot_id, modified_params: { model?, temperature?, system_prompt? } }
// Stub: In production, this would invoke OpenClaw with modified params
export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ 'conversation-id': string }> }
) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { snapshot_id, org_id, modified_params } = body

    if (!snapshot_id || !org_id || !modified_params) {
      return NextResponse.json(
        { error: 'snapshot_id, org_id, and modified_params required' },
        { status: 400 }
      )
    }

    const isMember = await isUserOrgMember(userId, org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Stub response — full implementation requires worker API to re-run with modified params
    return NextResponse.json({
      status: 'not_available',
      message:
        'Time-travel re-run is not yet available. Turn snapshots must be enabled and a worker re-run API must be deployed.',
      snapshot_id,
      modified_params,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/replay/[id]/time-travel POST' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
