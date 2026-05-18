import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { getProjectWorkData } from '@/lib/projects/work'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orgId, projectId } = await params
  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const project = await getProjectByIdForWorkspace(orgId, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '5', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 5

  const work = await getProjectWorkData(orgId, projectId)
  return NextResponse.json({
    summary: work.summary,
    items: work.items.slice(0, limit),
  })
}
