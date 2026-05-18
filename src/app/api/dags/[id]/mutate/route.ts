/**
 * DAG Mutation API — Phase 4N-c, Task 49.
 *
 * POST /api/dags/[id]/mutate — apply an operator-authored DAG expansion
 * (add nodes/edges) via optimistic concurrency control.
 *
 * Auth: admin/owner of the owning org. `[id]` is the dag UUID — we look
 * up `org_id` from `orchestration_dags` and gate on `getOrgMemberRole()`.
 *
 * Body (Zod-validated):
 *   {
 *     expectedVersion:  number   // graph_version the caller read
 *     idempotencyKey:   string   // idempotency boundary (UNIQUE(dag_id, key))
 *     mutationType?:    'expand' | 'cancel' | 'supersede' | 'budget_rebalance'
 *     targetNodeId?:    uuid | null  // audit-only anchor
 *     additions: {
 *       nodes: DagSpecNode[]
 *       edges: DagSpecEdge[]
 *     }
 *   }
 *
 * Responses:
 *   200 { appliedGraphVersion, addedNodeIds, idempotent }
 *   400 Validation failed
 *   403 Forbidden (not admin/owner)
 *   404 DAG not found
 *   409 CAS conflict (body: { error, expectedVersion, actualVersion })
 *   409 Cycle detected (body: { error, cycleNodes })
 *   423 Lock timeout (someone else is mutating right now)
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
import {
  DagMutator,
  CasConflictError,
  CycleError,
  LockTimeoutError,
  DagNotFoundError,
  mutateDagInputSchema,
} from '@/lib/dag/mutator'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const dagIdSchema = z.string().uuid()

/**
 * POST — apply a DAG mutation. Admin/owner only.
 */
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
    const validated = mutateDagInputSchema.parse(body)

    // Look up org_id for role gating. The mutator's pre-check will also
    // error if the dag doesn't exist, but we need org_id first to authorize.
    const { data: dagRow, error: dagLookupError } = await supabase
      .from('orchestration_dags')
      .select('org_id')
      .eq('id', dagId)
      .maybeSingle()

    if (dagLookupError) {
      throw dagLookupError
    }
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

    const mutator = new DagMutator(supabase, (await getPulseRedis()) as never)
    const result = await mutator.apply({
      dagId,
      expectedVersion: validated.expectedVersion,
      idempotencyKey: validated.idempotencyKey,
      mutationType: validated.mutationType ?? 'expand',
      source: 'operator',
      sourceRunId: null,
      targetNodeId: validated.targetNodeId ?? null,
      additions: validated.additions,
      workerId: `operator:${userId}`,
    })

    return NextResponse.json({
      appliedGraphVersion: result.appliedGraphVersion,
      addedNodeIds: result.addedNodeIds,
      idempotent: result.idempotent,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    if (error instanceof CasConflictError) {
      return NextResponse.json(
        {
          error: 'CAS conflict',
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        },
        { status: 409 },
      )
    }
    if (error instanceof CycleError) {
      return NextResponse.json(
        { error: 'Cycle detected', cycleNodes: error.cycleNodes },
        { status: 409 },
      )
    }
    if (error instanceof LockTimeoutError) {
      return NextResponse.json(
        { error: 'DAG is being mutated by another operator — retry shortly' },
        { status: 423 },
      )
    }
    if (error instanceof DagNotFoundError) {
      return NextResponse.json({ error: 'DAG not found' }, { status: 404 })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/[id]/mutate', method: 'POST' },
      tags: { layer: 'api', route: 'dag-mutate' },
    })
    return NextResponse.json({ error: 'Failed to apply mutation' }, { status: 500 })
  }
})
