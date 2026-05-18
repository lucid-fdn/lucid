import { NextResponse } from 'next/server'

import { getWorkBoardReadModel } from '@/lib/work-graph'
import { requireWorkGraphReadAccess } from '../../../_auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; projectId: string; boardId: string }> },
) {
  const { id: orgId, projectId, boardId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const board = await getWorkBoardReadModel(orgId, boardId)
  if (!board || board.project_id !== projectId) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  }
  return NextResponse.json({ board })
}

