import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('privy-id-token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { userId, subscription } = await request.json();

    // Verify the claimed userId matches the authenticated user
    const { PrivyClient } = await import('@privy-io/server-auth')
    const privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    )
    try {
      const claims = await privy.verifyAuthToken(token)
      if (claims.userId !== userId) {
        return NextResponse.json(
          { error: 'User ID mismatch' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const { error } = await getSupabase()
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        subscription,
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: false,
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/push/subscribe/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}
