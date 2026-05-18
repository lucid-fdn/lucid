import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { createClient } from '@supabase/supabase-js'
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
 * GET /api/favorites
 * 
 * Get all favorites for authenticated user's current org
 * Query params: org_id (required)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('org_id')

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
    }

    // Use helper function for performance
    const { data, error } = await getSupabase()
      .rpc('get_user_favorites', {
        p_user_id: userId,
        p_org_id: orgId
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/favorites/route.ts',
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

/**
 * POST /api/favorites
 * 
 * Add a new favorite
 * Body: { org_id, favoritable_type, favoritable_id, name, url, icon? }
 */
export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { org_id, favoritable_type, favoritable_id, name, url, icon } = body

    // Validation
    if (!org_id || !favoritable_type || !favoritable_id || !name || !url) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const validTypes = ['project', 'agent', 'app', 'page', 'data_source']
    if (!validTypes.includes(favoritable_type)) {
      return NextResponse.json(
        { error: 'Invalid favoritable_type' },
        { status: 400 }
      )
    }

    // Get current max sort_order
    const { data: existingFavorites } = await getSupabase()
      .from('favorites')
      .select('sort_order')
      .eq('user_id', userId)
      .eq('org_id', org_id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const sort_order = existingFavorites && existingFavorites.length > 0
      ? existingFavorites[0].sort_order + 1
      : 0

    // Insert favorite
    const { data, error } = await getSupabase()
      .from('favorites')
      .insert({
        user_id: userId,
        org_id,
        favoritable_type,
        favoritable_id,
        name,
        url,
        icon: icon || null,
        sort_order
      })
      .select()
      .single()

    if (error) {
      // Handle duplicate favorite
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Already favorited' },
          { status: 409 }
        )
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/favorites/route.ts',
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
})
