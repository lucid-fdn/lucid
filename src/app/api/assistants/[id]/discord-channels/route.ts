import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listDiscordChannelsForGuild } from '@/lib/db'
import {
  clearChannelSurfaceDefault,
  listChannelSurfaceDefaultBindings,
  setChannelSurfaceDefault,
} from '@/lib/db/channel-routing'
import {
  ChannelAdminRouteError,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { discordWorkerFetch } from '@/lib/discord/worker-admin'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

interface DiscordGuildChannelPayload {
  id: string
  name: string
  type: 'text' | 'announcement'
  parentId: string | null
  parentName: string | null
  position: number
}

const patchSchema = z.object({
  guildId: z.string().min(1),
  discordChannelId: z.string().min(1).max(64),
  assistantId: z.string().uuid().nullable(),
})

function mapDiscordWorkerError(error: unknown): ChannelAdminRouteError | null {
  if (!(error instanceof Error)) return null
  const message = error.message

  if (message.startsWith('Worker 404:')) {
    return new ChannelAdminRouteError(
      503,
      'Discord channel inventory is not available on the current worker deployment yet. Redeploy the gateway worker on the latest commit and try again.',
    )
  }

  if (message.includes('Discord gateway unavailable')) {
    return new ChannelAdminRouteError(
      503,
      'Discord channel inventory requires a gateway worker with the hosted Discord bot active. Check WORKER_ROLE and the Discord gateway deployment.',
    )
  }

  if (message.startsWith('Worker 502:')) {
    return new ChannelAdminRouteError(
      502,
      message.replace(/^Worker 502:\s*/, '') || 'Failed to load Discord guild channels from the worker.',
    )
  }

  if (message.startsWith('WORKER_URL not configured')) {
    return new ChannelAdminRouteError(
      503,
      'Discord channel inventory is not configured because WORKER_URL is missing on the app server.',
    )
  }

  return null
}

function scopeDiscordGuildBindings(params: {
  bindings: Awaited<ReturnType<typeof listDiscordChannelsForGuild>>
  orgId: string
}) {
  const foreignBinding = params.bindings.find(
    (binding) => binding.org_id && binding.org_id !== params.orgId,
  )

  if (foreignBinding) {
    throw new ChannelAdminRouteError(
      409,
      'This Discord server is linked to another workspace and cannot be managed here.',
    )
  }

  return params.bindings.filter(
    (binding) => !binding.org_id || binding.org_id === params.orgId,
  )
}

async function loadGuildChannels(guildId: string): Promise<DiscordGuildChannelPayload[]> {
  try {
    const payload = (await discordWorkerFetch(
      `/discord/guild-channels?guildId=${encodeURIComponent(guildId)}`,
    )) as { channels?: DiscordGuildChannelPayload[] } | null

    return Array.isArray(payload?.channels) ? payload.channels : []
  } catch (error) {
    const mapped = mapDiscordWorkerError(error)
    if (mapped) {
      throw mapped
    }
    throw error
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const guildId = request.nextUrl.searchParams.get('guildId')?.trim() || ''
    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 })
    }

    const bindings = scopeDiscordGuildBindings({
      bindings: await listDiscordChannelsForGuild(guildId),
      orgId: assistant.org_id,
    })

    const guildChannels = await loadGuildChannels(guildId)
    const overrides = await listChannelSurfaceDefaultBindings({
      channelType: 'discord',
      surfaceOwnerKind: 'discord-channel',
      surfaceOwnerIds: guildChannels.map((channel) => channel.id),
    })
    const overridesByChannelId = new Map(
      overrides.map((override) => [override.surfaceOwnerId, override]),
    )
    const assistantsById = new Map(
      bindings.map((binding) => [
        binding.assistant_id,
        {
          assistantId: binding.assistant_id,
          assistantName: binding.assistant_name,
          bindingChannelId: binding.id,
        },
      ]),
    )

    return NextResponse.json({
      guildId,
      channels: guildChannels.map((channel) => {
        const override = overridesByChannelId.get(channel.id) ?? null
        const assignedAssistant =
          override && assistantsById.has(override.assistantId)
            ? assistantsById.get(override.assistantId) ?? null
            : null

        return {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          parentName: channel.parentName,
          position: channel.position,
          assignedAssistantId: assignedAssistant?.assistantId ?? null,
          assignedAssistantName: assignedAssistant?.assistantName ?? null,
          assignedBindingChannelId: assignedAssistant?.bindingChannelId ?? null,
          usesGuildDefault: !assignedAssistant,
        }
      }),
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/discord-channels', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-discord-channels' },
    })
    return NextResponse.json({ error: 'Failed to load Discord channels.' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const bindings = scopeDiscordGuildBindings({
      bindings: await listDiscordChannelsForGuild(parsed.data.guildId),
      orgId: assistant.org_id,
    })

    const guildChannels = await loadGuildChannels(parsed.data.guildId)
    const channelExists = guildChannels.some((channel) => channel.id === parsed.data.discordChannelId)
    if (!channelExists) {
      return NextResponse.json(
        { error: 'That Discord channel is not available in the selected server.' },
        { status: 404 },
      )
    }

    if (!parsed.data.assistantId) {
      await clearChannelSurfaceDefault({
        channelType: 'discord',
        surfaceOwnerKind: 'discord-channel',
        surfaceOwnerId: parsed.data.discordChannelId,
      })

      return NextResponse.json({
        ok: true,
        guildId: parsed.data.guildId,
        discordChannelId: parsed.data.discordChannelId,
        assistantId: null,
      })
    }

    const targetBinding = bindings.find(
      (binding) => binding.assistant_id === parsed.data.assistantId,
    )
    if (!targetBinding) {
      return NextResponse.json(
        { error: 'That agent is not connected to this Discord server.' },
        { status: 409 },
      )
    }

    await setChannelSurfaceDefault({
      channelType: 'discord',
      surfaceOwnerKind: 'discord-channel',
      surfaceOwnerId: parsed.data.discordChannelId,
      assistantId: targetBinding.assistant_id,
      assistantChannelId: targetBinding.id,
    })

    return NextResponse.json({
      ok: true,
      guildId: parsed.data.guildId,
      discordChannelId: parsed.data.discordChannelId,
      assistantId: targetBinding.assistant_id,
      assistantName: targetBinding.assistant_name,
      bindingChannelId: targetBinding.id,
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/discord-channels', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-discord-channels' },
    })
    return NextResponse.json({ error: 'Failed to update Discord channel routing.' }, { status: 500 })
  }
}
