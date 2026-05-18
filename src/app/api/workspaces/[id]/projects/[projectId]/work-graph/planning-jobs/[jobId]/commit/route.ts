import { NextRequest, NextResponse } from 'next/server'
import { WorkGraphCommitRequestSchema } from '@contracts/work-graph'

import { commitWorkGraphPlanningJob } from '@/lib/work-graph'
import { requireWorkGraphWriteAccess } from '../../../_auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string; jobId: string }> },
) {
  const { id: orgId, projectId, jobId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = WorkGraphCommitRequestSchema.parse({
    planning_job_id: jobId,
    ...(await request.json().catch(() => ({}))),
  })

  const result = await commitWorkGraphPlanningJob({
    orgId,
    request: body,
    actorUserId: access.userId,
  })
  if (!result || result.planningJob.project_id !== projectId) {
    return NextResponse.json(
      { error: 'Planning job is not ready to commit' },
      { status: 409 },
    )
  }
  return NextResponse.json(result)
}

