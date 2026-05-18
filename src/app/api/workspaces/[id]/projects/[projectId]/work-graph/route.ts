import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createPlanningJob, createWorkBoard, createWorkGoal, listWorkGraphOverview } from '@/lib/work-graph'
import { requireWorkGraphReadAccess, requireWorkGraphWriteAccess } from './_auth'

export const dynamic = 'force-dynamic'

const createShortcutSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('goal'),
    goal: z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(20_000).nullable().optional(),
      priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
      target_date: z.string().datetime().nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal('board'),
    board: z.object({
      name: z.string().min(1).max(240),
      goal_id: z.string().uuid().nullable().optional(),
      kind: z.enum(['kanban', 'roadmap', 'goal', 'external_mirror']).optional(),
      scope: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal('planning_job'),
    planning_job: z.object({
      goal_id: z.string().uuid().nullable().optional(),
      source: z.enum(['goal_create', 'builder', 'board_action', 'external_import', 'agent_ops']),
      input: z.record(z.string(), z.unknown()),
      model_policy: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphReadAccess(orgId, projectId)
  if (!access.ok) return access.response

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)
  const limit = Number.isFinite(limitParam) ? limitParam : 50
  const overview = await listWorkGraphOverview(orgId, projectId, limit)
  return NextResponse.json({ overview })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: orgId, projectId } = await params
  const access = await requireWorkGraphWriteAccess(orgId, projectId)
  if (!access.ok) return access.response

  const body = createShortcutSchema.parse(await request.json())

  if (body.type === 'goal') {
    const goal = await createWorkGoal(
      orgId,
      { ...body.goal, project_id: projectId, source: 'lucid' },
      { actorKind: 'user', actorUserId: access.userId },
    )
    if (!goal) return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
    return NextResponse.json({ goal }, { status: 201 })
  }

  if (body.type === 'board') {
    const result = await createWorkBoard(
      orgId,
      { ...body.board, project_id: projectId },
      { actorKind: 'user', actorUserId: access.userId },
    )
    if (!result) return NextResponse.json({ error: 'Failed to create board' }, { status: 500 })
    return NextResponse.json(result, { status: 201 })
  }

  const job = await createPlanningJob(
    orgId,
    { ...body.planning_job, project_id: projectId },
    { actorKind: 'user', actorUserId: access.userId },
  )
  if (!job) return NextResponse.json({ error: 'Failed to create planning job' }, { status: 500 })
  return NextResponse.json({ planningJob: job }, { status: 201 })
}

