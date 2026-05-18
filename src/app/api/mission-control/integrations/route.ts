import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/integrations?org_id=xxx
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

    // Fetch channels with health info
    const { data: channels, error: channelsError } = await supabase
      .from('assistant_channels')
      .select(`
        id,
        channel_type,
        is_active,
        created_at,
        ai_assistants!inner(name, org_id)
      `)
      .eq('ai_assistants.org_id', orgId)

    if (channelsError) {
      ErrorService.captureException(channelsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/integrations', query: 'channels' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
    }

    // Fetch plugin installations
    const { data: plugins, error: pluginsError } = await supabase
      .from('org_plugin_installations')
      .select(`
        id,
        plugin_catalog!inner(slug, name),
        installed_version,
        config
      `)
      .eq('org_id', orgId)

    if (pluginsError) {
      ErrorService.captureException(pluginsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/integrations', query: 'plugins' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 })
    }

    return NextResponse.json({
      channels: (channels || []).map((ch: any) => ({
        id: ch.id,
        channel_type: ch.channel_type,
        assistant_name: ch.ai_assistants?.name ?? 'Unknown',
        is_active: ch.is_active,
        last_event_at: null,
        error_count_24h: 0,
      })),
      plugins: (plugins || []).map((p: any) => ({
        id: p.id,
        slug: p.plugin_catalog?.slug ?? '',
        name: p.plugin_catalog?.name ?? 'Unknown',
        is_active: true,
        tool_call_count: 0,
        error_count: 0,
      })),
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/integrations' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
