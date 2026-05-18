import { NextResponse } from 'next/server'

import { runWorkGraphPlanningJob } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../../../_auth'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; projectId: string; jobId: string }> },
) {
  const { id: orgId, projectId, jobId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const planningJob = await runWorkGraphPlanningJob({
    orgId,
    planningJobId: jobId,
    actorUserId: access.userId,
  })
  if (!planningJob || planningJob.project_id !== projectId) {
    return NextResponse.json({ error: 'Planning job not found' }, { status: 404 })
  }
  return NextResponse.json({ planningJob })
}

