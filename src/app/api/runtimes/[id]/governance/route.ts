import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeById } from '@/lib/db/mission-control'
import { governanceActionSchema } from '@/lib/mission-control/schemas'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/runtimes/[id]/governance?org_id=xxx
 *
 * Queue a C2a governance action (pause/resume/stop channels).
 * Uses atomic JSONB append via RPC to avoid read-modify-write races.
 * Actions are consumed + cleared by the runtime on its next heartbeat (~30s).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = governanceActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Atomic JSONB append — concurrent requests cannot lose each other's actions.
    // Uses PostgreSQL `||` operator to append to the array in a single UPDATE.
    const { data: result, error } = await supabase.rpc('append_runtime_governance_action', {
      p_runtime_id: id,
      p_org_id: orgId,
      p_action: parsed.data,
    })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { endpoint: '/api/runtimes/[id]/governance POST', runtimeId: id },
        tags: { layer: 'api', route: 'runtimes' },
      })
      return NextResponse.json({ error: 'Failed to queue action' }, { status: 500 })
    }

    return NextResponse.json({
      status: 'queued',
      action: parsed.data,
      pendingCount: result ?? 0,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/governance POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
