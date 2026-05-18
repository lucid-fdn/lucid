import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/organizations/[orgId]/leave
 * 
 * Allows a user to leave an organization
 * 
 * Rules:
 * - Cannot leave if you're the owner (must transfer ownership first)
 * - Cannot leave personal workspaces
 * - Removes user's membership from organization
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = await params

    // Get user's membership
    const { data: membership } = await getSupabase()
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 404 }
      )
    }

    // Cannot leave if owner
    if (membership.role === 'owner') {
      return NextResponse.json(
        { error: 'Organization owners cannot leave. Please transfer ownership or delete the organization.' },
        { status: 400 }
      )
    }

    // Check if this is a personal workspace
    const { data: org } = await getSupabase()
      .from('organizations')
      .select('type')
      .eq('id', orgId)
      .single()

    if (org?.type === 'personal') {
      return NextResponse.json(
        { error: 'Cannot leave your personal workspace' },
        { status: 400 }
      )
    }

    // Remove membership
    const { error } = await getSupabase()
      .from('organization_members')
      .delete()
      .eq('id', membership.id)

    if (error) {
      console.error('[API] Leave organization error:', error)
      throw error
    }

    return NextResponse.json({ 
      success: true,
      message: 'Successfully left organization'
    })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/leave/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to leave organization' },
      { status: 500 }
    )
  }
}
