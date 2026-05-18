import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth/session'
import { withCSRF } from '@/lib/auth/csrf'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const PATCH = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ orgId: string; memberId: string }> }) => {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, memberId } = (await ctx.params)
    const { role } = await req.json()

    // Check if requester has permission (owner or admin)
    const { data: requesterMembership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!requesterMembership || 
        (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Cannot change owner role
    const { data: targetMember } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('id', memberId)
      .single()

    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change owner role' },
        { status: 400 }
      )
    }

    // Update role
    const { error } = await getSupabase()
      .from('organization_members')
      .update({ role })
      .eq('id', memberId)

    if (error) throw error

    return NextResponse.json({ success: true, role })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/members/:memberId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to update member' },
      { status: 500 }
    )
  }
})

export const DELETE = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ orgId: string; memberId: string }> }) => {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, memberId } = (await ctx.params)

    // Check if requester has permission (owner or admin)
    const { data: requesterMembership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!requesterMembership || 
        (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Cannot remove owner
    const { data: targetMember } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('id', memberId)
      .single()

    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove workspace owner' },
        { status: 400 }
      )
    }

    // Delete member
    const { error } = await getSupabase()
      .from('organization_members')
      .delete()
      .eq('id', memberId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/members/:memberId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    )
  }
})
