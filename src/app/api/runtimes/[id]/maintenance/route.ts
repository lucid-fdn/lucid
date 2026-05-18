import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  runtimeMaintenanceRequestSchema,
  runtimeMaintenanceStateSchema,
} from '@/lib/mission-control/schemas'
import {
  getRuntimeMaintenanceOverview,
  performRuntimeMaintenanceAction,
} from '@/lib/runtimes/maintenance'
import { canUseRuntimeMaintenance } from '@/lib/mission-control/plan-check'
import { sanitizeRuntimeMaintenanceStateForClient } from '@/lib/mission-control/runtime-client-sanitize'

export const dynamic = 'force-dynamic'

async function authorize(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) {
    return { ok: false as const, response: NextResponse.json({ error: 'org_id required' }, { status: 400 }) }
  }

  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, userId, orgId }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (!auth.ok) return auth.response

    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Number(limitParam) : 10
    const { id } = await params

    const state = await getRuntimeMaintenanceOverview(id, auth.orgId, Number.isFinite(limit) ? limit : 10)
    if (!state) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    const safeState = sanitizeRuntimeMaintenanceStateForClient(state)
    const parsed = runtimeMaintenanceStateSchema.safeParse(safeState)
    return NextResponse.json({ maintenance: parsed.success ? parsed.data : safeState })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/maintenance GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const parsed = runtimeMaintenanceRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!(await canUseRuntimeMaintenance(auth.orgId))) {
      return NextResponse.json({ error: 'Runtime maintenance controls require a Pro plan or higher' }, { status: 403 })
    }

    const { id } = await params
    const outcome = await performRuntimeMaintenanceAction({
      runtimeId: id,
      orgId: auth.orgId,
      requestedBy: auth.userId,
      ...parsed.data,
    })

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }

    return NextResponse.json({
      result: outcome.result,
      maintenance: outcome.state ? sanitizeRuntimeMaintenanceStateForClient(outcome.state) : null,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/maintenance POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
