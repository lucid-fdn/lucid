import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/server-utils';
import { revokeInvite } from '@/lib/db';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/workspace/[id]/invites/[inviteId]/revoke
 * Revoke a pending invite
 * Only owners and admins can revoke invites
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    await requireUserId();
    
    // Revoke invite (RLS ensures only owner/admin can revoke)
    await revokeInvite((await params).inviteId);
    
    return NextResponse.json({
      success: true,
      message: 'Invite revoked successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/orgs/:id/invites/:inviteId/revoke/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to revoke invite' },
      { status: 500 }
    );
  }
}
