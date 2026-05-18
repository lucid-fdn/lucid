import { NextRequest, NextResponse } from 'next/server'
import { WorkBoardColumnCreateSchema, WorkBoardCreateSchema } from '@contracts/work-graph'
import { z } from 'zod'

import { createWorkBoard, listWorkBoards } from '@/lib/work-graph'
import { requireWorkGraphReadAccess, requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

const createBoardSchema = WorkBoardCreateSchema.extend({
  columns: z.array(WorkBoardColumnCreateSchema).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const includeArchived = request.nextUrl.searchParams.get('include_archived') === 'true'
  const boards = await listWorkBoards(orgId, projectId, { includeArchived })
  return NextResponse.json({ boards })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = createBoardSchema.parse(await request.json())
  const result = await createWorkBoard(
    orgId,
    { ...body, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!result) return NextResponse.json({ error: 'Failed to create board' }, { status: 500 })
  return NextResponse.json(result, { status: 201 })
}

