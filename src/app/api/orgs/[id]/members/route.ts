import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/workspace/[id]/members
 * List all members of an organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUserId();
    
    // Get organization members with profile info
    const { data: members, error } = await getSupabase()
      .from('organization_members')
      .select(`
        user_id,
        role,
        joined_at,
        profiles:user_id (
          name,
          email,
          avatar_url
        )
      `)
      .eq('organization_id', (await params).id)
      .order('joined_at', { ascending: true });
    
    if (error) {
      console.error('[api] Failed to fetch members:', error);
      throw error;
    }
    
    // Transform data to flat structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedMembers = members?.map((m: any) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return {
        user_id: m.user_id,
        name: profile?.name || 'Unknown',
        email: profile?.email || '',
        role: m.role,
        avatar_url: profile?.avatar_url,
        joined_at: m.joined_at,
        mfa_enabled: false,
      }
    }) || [];
    
    return NextResponse.json({
      success: true,
      members: formattedMembers,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/orgs/:id/members/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspace/[id]/members
 * Update a member's role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestingUserId = await requireUserId();
    const orgId = (await params).id;
    const body = await request.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or role' },
        { status: 400 }
      );
    }

    // Validate role value
    const ALLOWED_ROLES = ['owner', 'admin', 'member', 'guest'] as const;
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { success: false, error: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Prevent setting role to owner (only owner transfer should do that)
    if (role === 'owner') {
      return NextResponse.json(
        { success: false, error: 'Cannot set role to owner. Use owner transfer instead.' },
        { status: 400 }
      );
    }

    // Check if requester has permission (owner or admin)
    const { data: requesterMembership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', requestingUserId)
      .single();

    if (!requesterMembership ||
        (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Cannot change owner's role
    const { data: targetMember } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { success: false, error: 'Cannot change owner role' },
        { status: 400 }
      );
    }

    // Update member role
    const { error } = await getSupabase()
      .from('organization_members')
      .update({ role })
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) {
      console.error('[api] Failed to update member role:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Member role updated successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/orgs/:id/members/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update member' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspace/[id]/members
 * Remove a member from organization
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestingUserId = await requireUserId();
    const orgId = (await params).id;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Check if requester has permission (owner or admin)
    const { data: requesterMembership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', requestingUserId)
      .single();

    if (!requesterMembership ||
        (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Cannot remove the owner
    const { data: targetMember } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { success: false, error: 'Cannot remove workspace owner' },
        { status: 400 }
      );
    }

    // Delete member
    const { error } = await getSupabase()
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) {
      console.error('[api] Failed to remove member:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/orgs/:id/members/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to remove member' },
      { status: 500 }
    );
  }
}
