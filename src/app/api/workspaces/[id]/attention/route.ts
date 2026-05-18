import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getWorkspaceAttentionData } from '@/lib/workspace/attention'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orgId } = await params
  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const attention = await getWorkspaceAttentionData(orgId)
  return NextResponse.json({
    summary: attention.summary,
    attentionCount: attention.attentionCount,
  })
}
