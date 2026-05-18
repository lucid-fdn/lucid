import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/db'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/user/profile
 * Fetch current user's profile from Supabase
 * Uses centralized getProfile() with React cache()
 */
export async function GET() {
  try {
    const userId = await getUserId()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use your centralized getProfile with cache()
    const profile = await getProfile(userId)
    
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json(profile)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/user/profile/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
