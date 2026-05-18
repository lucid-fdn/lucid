/**
 * DAG Replay API — Phase 4N-d, Task 71.
 *
 * POST /api/dags/[id]/replay — fork an existing DAG at a chosen fork
 * node. The new DAG starts in `status='pending'` and is picked up by
 * the scheduler's normal `onDagCreated` flow on the worker side.
 *
 * Auth: admin/owner of the owning org. `[id]` is the ORIGINAL dag UUID.
 *
 * Body (Zod-validated):
 *   {
 *     fromNodeId: uuid   // node of [id] to fork at — it and its
 *                        // descendants will be re-run; strict
 *                        // ancestors are cloned as 'completed'.
 *   }
 *
 * Responses:
 *   200 { newDagId, totalNodes, completedNodes, pendingNodes, readyNodes, replayedMutations }
 *   400 Validation failed
 *   403 Forbidden (not admin/owner)
 *   404 DAG not found / fork point not in dag
 *   500 Unexpected error
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import {
  checkRateLimit,
  getRequestIdentifier,
  RateLimitPresets,
} from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import { DagMutator } from '@/lib/dag/mutator'
import {
  DagReplay,
  DagReplayError,
  DagReplayNotFoundError,
} from '@/lib/dag/replay'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const dagIdSchema = z.string().uuid()
const replayInputSchema = z.object({
  fromNodeId: z.string().uuid(),
})

export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: rawDagId } = await (ctx as { params: Promise<{ id: string }> }).params
    const dagIdParsed = dagIdSchema.safeParse(rawDagId)
    if (!dagIdParsed.success) {
      return NextResponse.json({ error: 'Invalid dag id' }, { status: 400 })
    }
    const dagId = dagIdParsed.data

    const body = await req.json()
    const validated = replayInputSchema.parse(body)

    const { data: dagRow, error: dagLookupError } = await supabase
      .from('orchestration_dags')
      .select('org_id')
      .eq('id', dagId)
      .maybeSingle()

    if (dagLookupError) throw dagLookupError
    if (!dagRow) {
      return NextResponse.json({ error: 'DAG not found' }, { status: 404 })
    }

    const orgId = dagRow.org_id as string
    const role = await getOrgMemberRole(userId, orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json(
        { error: 'Admin or owner role required' },
        { status: 403 },
      )
    }

    // Wire DagMutator so any agent-authored expansions in the original
    // DAG replay into the clone in applied_graph_version order.
    const mutator = new DagMutator(supabase, (await getPulseRedis()) as never)
    const replay = new DagReplay(supabase, mutator)

    const result = await replay.fork({
      originalDagId: dagId,
      fromNodeId: validated.fromNodeId,
      operatorId: userId,
    })

    return NextResponse.json({
      newDagId: result.newDagId,
      totalNodes: result.totalNodes,
      completedNodes: result.completedNodes,
      pendingNodes: result.pendingNodes,
      readyNodes: result.readyNodes,
      replayedMutations: result.replayedMutations,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    if (error instanceof DagReplayNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof DagReplayError) {
      // Fork-point-not-in-dag etc. — surface the message as a 404 so
      // operators immediately see the bad input rather than a 500.
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/[id]/replay', method: 'POST' },
      tags: { layer: 'api', route: 'dag-replay' },
    })
    return NextResponse.json({ error: 'Failed to fork DAG' }, { status: 500 })
  }
})
