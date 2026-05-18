import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/conversations/volume?org_id=xxx
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get org's assistant IDs
    const { data: assistants, error: assistantsError } = await supabase
      .from('ai_assistants')
      .select('id')
      .eq('org_id', orgId)
      .is('deleted_at', null)

    if (assistantsError) {
      ErrorService.captureException(assistantsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/conversations/volume', query: 'assistants' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch assistants' }, { status: 500 })
    }

    const assistantIds = (assistants || []).map((a: any) => a.id)

    // Get message counts per day for last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: events, error: eventsError } = await supabase
      .from('assistant_inbound_events')
      .select('created_at, assistant_id')
      .in('assistant_id', assistantIds)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    if (eventsError) {
      ErrorService.captureException(eventsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/conversations/volume', query: 'events' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch event volume' }, { status: 500 })
    }

    // Aggregate by date
    const dayCounts: Record<string, number> = {}
    for (const event of events || []) {
      const date = new Date(event.created_at).toISOString().split('T')[0]
      dayCounts[date] = (dayCounts[date] || 0) + 1
    }

    // Fill in missing days
    const volume: Array<{ date: string; count: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      volume.push({ date: dateStr, count: dayCounts[dateStr] || 0 })
    }

    return NextResponse.json({ volume })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/conversations/volume' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
