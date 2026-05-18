import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember, listAssistantChannels } from '@/lib/db'
import { discordWorkerFetch } from '@/lib/discord/worker-admin'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

async function assertDiscordChannelAccess(params: {
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
  if (!channel || channel.channel_type !== 'discord') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Discord channel not found' }, { status: 404 }),
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
    const access = await assertDiscordChannelAccess({ assistantId: id, channelId, userId })
    if (!access.ok) return access.response

    const status = await discordWorkerFetch('/discord/status')
    return NextResponse.json(status)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/assistants/[id]/channels/[channelId]/discord-status',
        method: 'GET',
      },
      tags: { layer: 'api', route: 'assistant-discord-status' },
    })
    return NextResponse.json({ error: 'Failed to fetch Discord status' }, { status: 500 })
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
    const access = await assertDiscordChannelAccess({ assistantId: id, channelId, userId })
    if (!access.ok) return access.response

    const status = await discordWorkerFetch('/discord/probe', { method: 'POST' })
    return NextResponse.json(status)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/assistants/[id]/channels/[channelId]/discord-status',
        method: 'POST',
      },
      tags: { layer: 'api', route: 'assistant-discord-status' },
    })
    return NextResponse.json({ error: 'Failed to probe Discord status' }, { status: 500 })
  }
}
