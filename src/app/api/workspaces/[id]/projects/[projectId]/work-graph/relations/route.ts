import { NextRequest, NextResponse } from 'next/server'
import { WorkItemRelationCreateSchema } from '@contracts/work-graph'

import { createWorkItemRelation } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = WorkItemRelationCreateSchema.parse(await request.json())
  const result = await createWorkItemRelation(
    orgId,
    { ...body, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (result.error === 'not_found') return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
  if (result.error === 'cycle') return NextResponse.json({ error: 'Relation would create a cycle' }, { status: 409 })
  if (!result.relation) return NextResponse.json({ error: 'Failed to create relation' }, { status: 500 })
  return NextResponse.json({ relation: result.relation }, { status: 201 })
}

