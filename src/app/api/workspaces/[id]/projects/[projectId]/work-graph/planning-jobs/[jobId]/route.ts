import { NextResponse } from 'next/server'

import { getPlanningJob } from '@/lib/work-graph'
import { requireWorkGraphReadAccess } from '../../_auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; projectId: string; jobId: string }> },
) {
  const { id: orgId, projectId, jobId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const planningJob = await getPlanningJob(orgId, jobId)
  if (!planningJob || planningJob.project_id !== projectId) {
    return NextResponse.json({ error: 'Planning job not found' }, { status: 404 })
  }
  return NextResponse.json({ planningJob })
}

