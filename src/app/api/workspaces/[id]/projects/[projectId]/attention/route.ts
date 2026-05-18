import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { getProjectAttentionData } from '@/lib/projects/attention'

export async function GET(
  _request: NextRequest,
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

  const attention = await getProjectAttentionData(orgId, projectId)
  return NextResponse.json({ summary: attention.summary })
}
