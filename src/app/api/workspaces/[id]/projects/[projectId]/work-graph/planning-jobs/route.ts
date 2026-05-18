import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createPlanningJob, listPlanningJobs, runWorkGraphPlanningJob } from '@/lib/work-graph'
import { requireWorkGraphReadAccess, requireWorkGraphWriteAccess } from '../_auth'

export const dynamic = 'force-dynamic'

const createPlanningJobSchema = z.object({
  goal_id: z.string().uuid().nullable().optional(),
  source: z.enum(['goal_create', 'builder', 'board_action', 'external_import', 'agent_ops']),
  input: z.record(z.string(), z.unknown()),
  model_policy: z.record(z.string(), z.unknown()).optional(),
  run_immediately: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)
  const jobs = await listPlanningJobs(orgId, projectId, Number.isFinite(limitParam) ? limitParam : 50)
  return NextResponse.json({ planningJobs: jobs })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = createPlanningJobSchema.parse(await request.json())
  const job = await createPlanningJob(
    orgId,
    { ...body, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!job) return NextResponse.json({ error: 'Failed to create planning job' }, { status: 500 })
  if (body.run_immediately) {
    const planningJob = await runWorkGraphPlanningJob({
      orgId,
      planningJobId: job.id,
      actorUserId: access.userId,
    })
    return NextResponse.json({ planningJob: planningJob ?? job }, { status: 201 })
  }
  return NextResponse.json({ planningJob: job }, { status: 201 })
}
