import { NextRequest, NextResponse } from 'next/server'
import { WorkArtifactLinkCreateSchema } from '@contracts/work-graph'

import { attachWorkArtifactLink } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = WorkArtifactLinkCreateSchema.parse(await request.json())
  const artifactLink = await attachWorkArtifactLink(
    orgId,
    { ...body, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!artifactLink) return NextResponse.json({ error: 'Failed to attach artifact link' }, { status: 500 })
  return NextResponse.json({ artifactLink }, { status: 201 })
}

