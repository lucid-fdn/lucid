import { NextRequest, NextResponse } from 'next/server'
import { getOrgInviteToken, generateInviteToken, toggleInviteToken } from '@/lib/invites'
import { getServerSession } from '@/lib/auth/session'
import { canPerformAction } from '@/lib/access-control/server'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { orgId } = await params

    // Check permission: only owner/admin can view invite tokens
    const canInvite = await canPerformAction(session.userId, orgId, 'inviteMembers')
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Forbidden: Only owners and admins can view invite links' },
        { status: 403 }
      )
    }

    const result = await getOrgInviteToken(orgId)
    
    if (!result) {
      return NextResponse.json(
        { error: 'No invite token found or no access' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      token: result.token,
      enabled: result.enabled,
      role: result.role || 'member' // Include role from database
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/invites/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to get invite token' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const { orgId } = await params
    
    // Check permission: only owner/admin can generate invite tokens
    const canInvite = await canPerformAction(session.userId, orgId, 'inviteMembers')
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Forbidden: Only owners and admins can generate invite links' },
        { status: 403 }
      )
    }
    
    const result = await generateInviteToken(orgId, session.userId)
    
    return NextResponse.json({
      token: result.token,
      enabled: result.enabled
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/invites/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to generate invite token' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const { orgId } = await params
    
    // Check permission: only owner/admin can modify invite tokens
    const canInvite = await canPerformAction(session.userId, orgId, 'inviteMembers')
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Forbidden: Only owners and admins can modify invite links' },
        { status: 403 }
      )
    }
    
    const { enabled, role } = await request.json()
    
    // Update both enabled status and role if provided
    await toggleInviteToken(orgId, enabled)

    // If role is provided, update it separately
    if (role) {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const { error: roleError } = await supabase
        .from('org_invites')
        .update({ role })
        .eq('org_id', orgId)
      
      if (roleError) {
        console.error('[API] Role update error:', roleError)
        throw roleError
      }
    }

    return NextResponse.json({ success: true, enabled, role })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/invites/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to toggle invite token' },
      { status: 500 }
    )
  }
}
