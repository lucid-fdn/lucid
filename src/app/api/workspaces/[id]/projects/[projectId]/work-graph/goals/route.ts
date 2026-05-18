import { NextRequest, NextResponse } from 'next/server'
import { WorkGoalCreateSchema } from '@contracts/work-graph'

import { createWorkGoal, listWorkGoals } from '@/lib/work-graph'
import { requireWorkGraphReadAccess, requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const includeArchived = request.nextUrl.searchParams.get('include_archived') === 'true'
  const goals = await listWorkGoals(orgId, projectId, { includeArchived })
  return NextResponse.json({ goals })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = WorkGoalCreateSchema.parse(await request.json())
  const goal = await createWorkGoal(
    orgId,
    { ...body, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!goal) return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  return NextResponse.json({ goal }, { status: 201 })
}

