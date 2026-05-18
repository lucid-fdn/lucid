import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember, listAssistantChannels } from '@/lib/db'
import { slackWorkerFetch } from '@/lib/discord/worker-admin'
import { supabase } from '@/lib/db/client'
import { getHostedSlackActivitySnapshot } from '@/lib/slack/hosted-bindings'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

async function assertSlackChannelAccess(params: {
  assistantId: string
  channelId: string
  userId: string
}) {
  const assistant = await getAssistant(params.assistantId)
  if (!assistant) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Assistant not found' }, { status: 404 }),
    }
  }

  const isMember = await isUserOrgMember(params.userId, assistant.org_id)
  if (!isMember) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  const channels = await listAssistantChannels(params.assistantId)
  const channel = channels.find((entry) => entry.id === params.channelId)
  if (!channel || channel.channel_type !== 'slack') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Slack channel not found' }, { status: 404 }),
    }
  }

  return { ok: true as const, channel }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, channelId } = await params
    const access = await assertSlackChannelAccess({ assistantId: id, channelId, userId })
    if (!access.ok) return access.response

    const [status, snapshot] = await Promise.all([
      slackWorkerFetch('/slack/status'),
      getHostedSlackActivitySnapshot(supabase, channelId),
    ])

    return NextResponse.json({
      ...(status as Record<string, unknown>),
      snapshot,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/assistants/[id]/channels/[channelId]/slack-status',
        method: 'GET',
      },
      tags: { layer: 'api', route: 'assistant-slack-status' },
    })
    return NextResponse.json({ error: 'Failed to fetch Slack status' }, { status: 500 })
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, channelId } = await params
    const access = await assertSlackChannelAccess({ assistantId: id, channelId, userId })
    if (!access.ok) return access.response

    const [status, snapshot] = await Promise.all([
      slackWorkerFetch('/slack/probe', { method: 'POST' }),
      getHostedSlackActivitySnapshot(supabase, channelId),
    ])

    return NextResponse.json({
      ...(status as Record<string, unknown>),
      snapshot,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/assistants/[id]/channels/[channelId]/slack-status',
        method: 'POST',
      },
      tags: { layer: 'api', route: 'assistant-slack-status' },
    })
    return NextResponse.json({ error: 'Failed to probe Slack status' }, { status: 500 })
  }
}
