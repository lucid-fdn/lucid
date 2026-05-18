import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { markAllNotificationsAsRead } from '@/lib/db';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/mark-all-read
 * Marks all notifications as read for the user
 */
export async function POST(_request: NextRequest) {
  try {
    const userId = await requireUserId();
    
    await markAllNotificationsAsRead(userId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/notifications/mark-all-read/route.ts',
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
      { error: 'Failed to mark all notifications as read' },
      { status: 500 }
    );
  }
}
