import { NextRequest, NextResponse } from 'next/server'
import { WorkBoardMoveSchema } from '@contracts/work-graph'

import { moveWorkBoardItem } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../../../_auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string; boardId: string }> },
) {
  const { id: orgId, projectId, boardId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = WorkBoardMoveSchema.parse(await request.json())
  const board = await moveWorkBoardItem(
    orgId,
    boardId,
    body,
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!board || board.project_id !== projectId) {
    return NextResponse.json({ error: 'Failed to move board item' }, { status: 500 })
  }
  return NextResponse.json({ board })
}

