import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  listWorkItemsForOrg,
  createPulseStandaloneWorkItem,
  type WorkItemKind,
  type WorkItemPriority,
  type WorkItemStatus,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'
import { enrichWorkItemsWithSignals } from '@/lib/work-items/signals'
import { requireOrgPermission } from '@/lib/access-control/api'

export const dynamic = 'force-dynamic'

const FEATURE_HUMAN_WORK_ITEMS = process.env.FEATURE_HUMAN_WORK_ITEMS === 'true'

const STATUSES: readonly WorkItemStatus[] = [
  'open',
  'in_progress',
  'waiting',
  'done',
  'cancelled',
  'rejected',
] as const

const KINDS: readonly WorkItemKind[] = ['pulse_standalone', 'nerve_node'] as const
const PRIORITIES: readonly WorkItemPriority[] = ['critical', 'high', 'normal', 'low'] as const

const createSchema = z.object({
  pulse_job_run_id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable().optional(),
  priority: z.enum(PRIORITIES as unknown as [WorkItemPriority, ...WorkItemPriority[]]).optional(),
  labels: z.array(z.string().max(80)).max(20).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  assignee_role: z.string().max(80).nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
  sla_seconds: z.number().int().nonnegative().max(60 * 60 * 24 * 90).nullable().optional(),
})

/**
 * GET /api/orgs/[id]/work-items
 * List human work items for the org. Any member can read.
 *
 * Query params:
 *   - status: comma-separated WorkItemStatus values
 *   - kind: 'pulse_standalone' | 'nerve_node'
 *   - assignee: 'me' to filter by the current user
 *   - agent_id: comma-separated agent UUIDs to scope items to specific agents
 *   - limit, offset: pagination (limit capped at 200)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!FEATURE_HUMAN_WORK_ITEMS) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params
    const access = await requireOrgPermission(userId, orgId, 'editProjects')
    if (!access.ok) return access.response

    const sp = req.nextUrl.searchParams
    const statusParam = sp.get('status')
    const kindParam = sp.get('kind')
    const assigneeParam = sp.get('assignee')
    const agentIdsParam = sp.get('agent_id')

    const status = statusParam
      ? (statusParam
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is WorkItemStatus => (STATUSES as readonly string[]).includes(s)))
      : undefined

    const kind =
      kindParam && (KINDS as readonly string[]).includes(kindParam)
        ? (kindParam as WorkItemKind)
        : undefined
    const agentIds = agentIdsParam
      ? agentIdsParam
          .split(',')
          .map((value) => value.trim())
          .filter((value) => z.string().uuid().safeParse(value).success)
      : undefined

    const rawLimit = parseInt(sp.get('limit') ?? '50', 10)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50
    const rawOffset = parseInt(sp.get('offset') ?? '0', 10)
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0

    const items = await listWorkItemsForOrg(orgId, {
      status: status && status.length > 0 ? status : undefined,
      kind,
      assigneeUserId: assigneeParam === 'me' ? userId : undefined,
      agentIds: agentIds && agentIds.length > 0 ? agentIds : undefined,
      limit,
      offset,
    })

    return NextResponse.json({ items: await enrichWorkItemsWithSignals(items) })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/work-items', method: 'GET' },
      tags: { layer: 'api', route: 'work-items' },
    })
    return NextResponse.json({ error: 'Failed to load work items' }, { status: 500 })
  }
}

/**
 * POST /api/orgs/[id]/work-items
 * Create a Pulse-standalone work item (ticket/approval/support).
 * Nerve DAG work items are created server-side by the scheduler — not here.
 */
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    if (!FEATURE_HUMAN_WORK_ITEMS) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await (ctx as { params: Promise<{ id: string }> }).params
    const access = await requireOrgPermission(userId, orgId, 'editProjects')
    if (!access.ok) return access.response

    const body = await req.json()
    const validated = createSchema.parse(body)

    const workItem = await createPulseStandaloneWorkItem({
      org_id: orgId,
      pulse_job_run_id: validated.pulse_job_run_id,
      title: validated.title,
      description: validated.description ?? null,
      priority: validated.priority,
      labels: validated.labels ?? [],
      assignee_user_id: validated.assignee_user_id ?? null,
      assignee_role: validated.assignee_role ?? null,
      agent_id: validated.agent_id ?? null,
      due_at: validated.due_at ?? null,
      sla_seconds: validated.sla_seconds ?? null,
      created_by: userId,
    })

    if (!workItem) {
      return NextResponse.json({ error: 'Failed to create work item' }, { status: 500 })
    }

    return NextResponse.json({ workItem }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/work-items', method: 'POST' },
      tags: { layer: 'api', route: 'work-items' },
    })
    return NextResponse.json({ error: 'Failed to create work item' }, { status: 500 })
  }
})
