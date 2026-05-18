import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getNotifications } from '@/lib/db';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications
 * Fetches user's notifications
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const userId = await requireUserId();
    
    // Get limit from query params (default 50, max 100)
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    
    // Fetch notifications
    const notifications = await getNotifications(userId, limit);
    
    return NextResponse.json(notifications);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/api/notifications',
        method: 'GET'
      },
      tags: {
        layer: 'api',
        route: 'notifications'
      }
    });
    
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
