import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { markNotificationAsRead } from '@/lib/db';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/[id]/read
 * Marks a notification as read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const notificationId = (await params).id;
    
    await markNotificationAsRead(userId, notificationId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/notifications/:id/read/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}
