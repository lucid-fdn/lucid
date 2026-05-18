import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import {
  completeCrewRun,
  getCrew,
  getCrewRuns,
  getCrewTopology,
  markCrewRunRunning,
  startCrewRun,
  updateCrew,
} from '@/lib/db/crews'
import { ErrorService } from '@/lib/errors/error-service'
import { sendCrewRunStartEvent } from '@/lib/db/crew-run-orchestration'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET /api/crews/[id]/runs?org_id=xxx
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId,
      endpoint: '/api/crews/[id]/runs GET',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const crew = await getCrew(crewId, orgId, effectiveProjectId)
    if (!crew) {
      return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
    }

    const runs = await getCrewRuns(crewId)
    return NextResponse.json({ runs })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/runs GET' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/crews/[id]/runs
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId } = await params
    const body = await request.json()
    const orgId = body.org_id
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId: body.project_id,
      endpoint: '/api/crews/[id]/runs POST',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const crew = await getCrew(crewId, orgId, effectiveProjectId)
    if (!crew) {
      return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
    }

    const topology = await getCrewTopology(crewId, orgId, effectiveProjectId)
    if (!topology) {
      return NextResponse.json({ error: 'Failed to load crew topology' }, { status: 500 })
    }

    const coordinator = topology.members.find((m) => m.is_coordinator)
    if (!coordinator?.assistant_id) {
      return NextResponse.json({ error: 'Crew has no coordinator assigned' }, { status: 400 })
    }

    const runId = await startCrewRun(
      crewId,
      orgId,
      body.trigger_type ?? 'manual',
      userId,
    )

    if (!runId) {
      return NextResponse.json({ error: 'Failed to start crew run' }, { status: 500 })
    }

    const markedRunning = await markCrewRunRunning(runId)
    if (!markedRunning) {
      await completeCrewRun(runId, 'failed', undefined, 'state_transition_failed').catch((markErr) => {
        ErrorService.captureException(markErr, {
          severity: 'warning',
          context: { fn: 'completeCrewRun (mark running rollback)', crewId, runId },
          tags: { layer: 'api', route: 'crews' },
        })
      })
      return NextResponse.json(
        { error: 'Failed to start crew run', detail: 'state_transition_failed' },
        { status: 500 },
      )
    }

    try {
      await sendCrewRunStartEvent({
        crewId,
        crewName: crew.name,
        objective: crew.objective,
        runId,
        orgId,
        coordinatorAssistantId: coordinator.assistant_id,
        members: topology.members.map((m) => ({
          name: m.assistant_name ?? 'Unknown',
          role: m.role,
          assistantId: m.assistant_id ?? m.member_ref_id,
          isCoordinator: m.is_coordinator,
        })),
      })
    } catch (kickoffError) {
      const errorMessage = kickoffError instanceof Error ? kickoffError.message : String(kickoffError)
      ErrorService.captureException(kickoffError, {
        severity: 'error',
        context: { fn: 'sendCrewRunStartEvent', crewId, runId },
        tags: { layer: 'api', route: 'crews' },
      })
      await completeCrewRun(runId, 'failed', undefined, `kickoff_failed: ${errorMessage}`).catch((markErr) => {
        ErrorService.captureException(markErr, {
          severity: 'warning',
          context: { fn: 'completeCrewRun (rollback)', crewId, runId },
          tags: { layer: 'api', route: 'crews' },
        })
      })
      return NextResponse.json(
        { error: 'Failed to start crew run', detail: errorMessage },
        { status: 500 },
      )
    }

    if (crew.status === 'draft') {
      updateCrew(crewId, orgId, { status: 'active' }, effectiveProjectId).catch(() => {})
    }

    return NextResponse.json({ run_id: runId }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/runs POST' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
