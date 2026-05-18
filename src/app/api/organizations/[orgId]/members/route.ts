import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import { summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = await params

    // Check if user is member of this org
    const { data: membership } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Fetch all members
    const { data: membersList, error: membersError } = await getSupabase()
      .from('organization_members')
      .select('id, role, created_at, user_id')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })

    if (membersError) {
      console.error('[API] Members query failed:', summarizeError(membersError))
      throw membersError
    }

    // Fetch profiles for these members
    const userIds = membersList?.map(m => m.user_id) || []
    const { data: profiles, error: profilesError } = await getSupabase()
      .from('profiles')
      .select('id, handle, name, first_name, last_name, avatar_url, email')
      .in('id', userIds)

    if (profilesError) {
      console.error('[API] Profiles query failed:', summarizeError(profilesError))
      throw profilesError
    }

    // Combine members with profiles
    const members = membersList?.map(member => ({
      ...member,
      profiles: profiles?.find(p => p.id === member.user_id)
    }))

    return NextResponse.json({ members })
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/organizations/:orgId/members/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}
