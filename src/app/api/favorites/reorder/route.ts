import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { createClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * PATCH /api/favorites/reorder
 * 
 * Reorder favorites after drag-and-drop
 * Body: { org_id, favorite_ids: string[] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { org_id, favorite_ids } = body

    if (!org_id || !favorite_ids || !Array.isArray(favorite_ids)) {
      return NextResponse.json(
        { error: 'org_id and favorite_ids array required' },
        { status: 400 }
      )
    }

    // Use helper function for performance
    const { error } = await getSupabase()
      .rpc('reorder_favorites', {
        p_user_id: userId,
        p_org_id: org_id,
        p_favorite_ids: favorite_ids
      })

    if (error) {
      console.error('[api/favorites/reorder] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/favorites/reorder/route.ts',
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
