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

/**
 * PATCH /api/organizations/[orgId]
 * 
 * Updates organization details (owner/admin only)
 */
export const PATCH = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) => {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = (await ctx.params)
    const body = await req.json()

    // Check if user is owner or admin
    const { data: membership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners and admins can update workspace details.' },
        { status: 403 }
      )
    }

    // Update organization
    const { error } = await getSupabase()
      .from('organizations')
      .update({
        name: body.name,
        logo_url: body.logo_url || null,
        bio: body.bio || null,
        homepage: body.homepage || null,
        interests: body.interests || [],
        github_username: body.github_username || null,
        twitter_username: body.twitter_username || null,
        linkedin_url: body.linkedin_url || null,
        workspace_public: body.workspace_public ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      success: true,
      message: 'Organization updated successfully'
    })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
})

/**
 * DELETE /api/organizations/[orgId]
 * 
 * Deletes an entire organization (owner only)
 * 
 * Cascading deletes:
 * - All organization_members
 * - All invites
 * - All projects/environments (if any)
 * - The organization itself
 */
export const DELETE = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) => {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = (await ctx.params)

    // Check if requester is the owner
    const { data: membership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only organization owners can delete the organization' },
        { status: 403 }
      )
    }

    // Check if this is a personal workspace (shouldn't be deleted via this endpoint)
    const { data: org } = await getSupabase()
      .from('organizations')
      .select('type')
      .eq('id', orgId)
      .single()

    if (org?.type === 'personal') {
      return NextResponse.json(
        { error: 'Personal workspaces cannot be deleted' },
        { status: 400 }
      )
    }

    // Delete organization (cascade will handle members, invites, etc.)
    const { error } = await getSupabase()
      .from('organizations')
      .delete()
      .eq('id', orgId)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully'
    })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to delete organization' },
      { status: 500 }
    )
  }
})
