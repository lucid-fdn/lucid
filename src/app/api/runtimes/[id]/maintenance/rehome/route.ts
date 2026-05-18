import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { canUseRuntimeMaintenance } from '@/lib/mission-control/plan-check'
import { runtimeMaintenanceRequestSchema } from '@/lib/mission-control/schemas'
import { sanitizeRuntimeMaintenanceStateForClient } from '@/lib/mission-control/runtime-client-sanitize'
import { performRuntimeMaintenanceAction } from '@/lib/runtimes/maintenance'

export const dynamic = 'force-dynamic'

const rehomeRequestSchema = runtimeMaintenanceRequestSchema
  .omit({ action: true })
  .partial()

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

// Operator recovery path for Lucid-managed runtime re-home.
// The generic maintenance endpoint remains compatible, but UI/operator flows use
// this route so audit logs and client copy can name the action explicitly.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (!auth.ok) return auth.response

    if (!(await canUseRuntimeMaintenance(auth.orgId))) {
      return NextResponse.json({ error: 'Runtime maintenance controls require a Pro plan or higher' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = rehomeRequestSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { id } = await params
    const outcome = await performRuntimeMaintenanceAction({
      runtimeId: id,
      orgId: auth.orgId,
      requestedBy: auth.userId,
      action: 'rehome',
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
      context: { endpoint: '/api/runtimes/[id]/maintenance/rehome POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
