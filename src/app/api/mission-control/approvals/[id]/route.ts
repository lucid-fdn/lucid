import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { resolveApproval } from '@/lib/db/mission-control'
import { approvalActionSchema } from '@/lib/mission-control/schemas'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

// POST /api/mission-control/approvals/[id]
// Body: { action: 'approved' | 'denied', reason?: string }
export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: approvalId } = await params
    const body = await request.json()

    const parsed = approvalActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      )
    }

    // Get the approval to verify org membership
    const { data: approval } = await supabase
      .from('mc_pending_approvals')
      .select('org_id')
      .eq('id', approvalId)
      .single()

    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    // Verify org membership
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', approval.org_id)
      .eq('user_id', userId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await resolveApproval(
      approvalId,
      approval.org_id,
      userId,
      {
        approval_id: approvalId,
        action: parsed.data.action,
        reason: parsed.data.reason,
      }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Approval ${parsed.data.action}`,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/approvals/[id]' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
