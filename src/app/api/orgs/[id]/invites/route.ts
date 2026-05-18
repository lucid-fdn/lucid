import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireUserId } from '@/lib/auth/server-utils';
import { createInvite, getOrgInvites, getProfile } from '@/lib/db';
import { sendTransactional } from '@/lib/mail';
import { canPerformAction } from '@/lib/access-control/server';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Request schema
const CreateInviteSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['admin', 'member', 'guest']),
  sendEmail: z.boolean().optional().default(false),
  message: z.string().optional(),
});

/**
 * POST /api/workspace/[id]/invites
 * Create an invite for an organization
 * Only owners and admins can create invites
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;
  
  try {
    const userId = await requireUserId();

    const body = await request.json();

    const { email, role, sendEmail, message } = CreateInviteSchema.parse(body);

    // Check permission: only owner/admin can create invites
    const canInvite = await canPerformAction(userId, orgId, 'inviteMembers');

    if (!canInvite) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only owners and admins can create invites' },
        { status: 403 }
      );
    }
    
    // Create invite
    const { invite_id, token, is_refresh } = await createInvite({
      org_id: orgId,
      email,
      role,
      inviter_id: userId,
    });

    // Generate accept URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/invites/${token}`;
    
    // Send email if requested and email is provided
    if (sendEmail && email) {
      try {
        // Get organization details
        const { data: org } = await getSupabase()
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .single();
        
        // Get inviter details
        const inviter = await getProfile(userId);
        
        // Send invite email
        const _emailResult = await sendTransactional('invite', email, {
          orgName: org?.name || 'the organization',
          role,
          acceptUrl,
          inviterName: inviter?.name || 'A team member',
          message: message || undefined,
        }, {
          // ✅ FIX: For refreshed invites, add timestamp to allow re-sending
          dedupeKey: is_refresh 
            ? `invite:${invite_id}:${Date.now()}` 
            : `invite:${invite_id}`,
        });
        
      } catch (emailError) {
      ErrorService.captureException(emailError as Error, {
        severity: 'error',
        context: {
          endpoint: '/orgs/:id/invites',
          method: 'POST',
          email,
          orgId
        },
        tags: {
          layer: 'api',
          route: 'invites'
        }
      });
      
      // Return error to frontend so user knows email failed
      return NextResponse.json({
        success: false,
        error: 'Invite created but email failed to send',
        details: emailError instanceof Error ? emailError.message : String(emailError),
        invite: {
          id: invite_id,
          acceptUrl, // Still provide URL in case user wants to manually share
        },
      }, { status: 500 });
    }
    }

    return NextResponse.json({
      success: true,
      invite: {
        id: invite_id,
        token,
        acceptUrl,
        is_refresh,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/orgs/:id/invites',
        method: 'POST',
        orgId
      },
      tags: {
        layer: 'api',
        route: 'invites'
      }
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create invite' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspace/[id]/invites
 * List all invites for an organization
 * Only owners and admins can view invites
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
    const userId = await requireUserId();
    
    // Check permission: only owner/admin can view invites
    const canInvite = await canPerformAction(userId, orgId, 'inviteMembers');
    if (!canInvite) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only owners and admins can view invites' },
        { status: 403 }
      );
    }
    
    // Get invites
    const invites = await getOrgInvites(orgId);
    
    // Generate accept URLs for pending invites
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const invitesWithUrls = invites.map((invite: Record<string, unknown>) => ({
      ...invite,
      acceptUrl: invite.status === 'pending' ? `${baseUrl}/invites/${invite.token}/accept` : null,
    }));
    
    return NextResponse.json({
      success: true,
      invites: invitesWithUrls,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/orgs/:id/invites/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch invites' },
      { status: 500 }
    );
  }
}
