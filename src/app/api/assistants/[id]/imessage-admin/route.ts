import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  listHostedIMessageChannelsForChat,
  listHostedIMessageSurfaceChannels,
  listIMessageChannelsForChat,
  setPrimaryHostedIMessageChannel,
  setPrimaryIMessageChannel,
} from '@/lib/db'
import {
  clearChannelSurfaceDefault,
  getChannelSurfaceDefaultBinding,
  setChannelSurfaceDefault,
} from '@/lib/db/channel-routing'
import { getChannelProviderSurface } from '@/lib/db/channel-provider'
import {
  buildAssistantAliasMap,
  ChannelAdminRouteError,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import { ErrorService } from '@/lib/errors/error-service'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_chat_default'),
    chatId: z.string().min(1),
    bindingChannelId: z.string().uuid(),
    hosted: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('set_surface_default'),
    hostedSurfaceId: z.string().uuid(),
    assistantChannelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('clear_surface_default'),
    hostedSurfaceId: z.string().uuid(),
  }),
])

async function loadHostedSurfaceAdmin(params: {
  assistantId: string
  orgId: string
  channelId: string
}) {
  const supabase = createServiceClient()
  const { data: channel, error: channelError } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, connection_mode, external_channel_id, channel_config')
    .eq('id', params.channelId)
    .eq('assistant_id', params.assistantId)
    .eq('channel_type', 'imessage')
    .maybeSingle()

  if (channelError || !channel) {
    return { error: 'iMessage channel not found', status: 404 as const }
  }

  if (channel.connection_mode !== 'hosted') {
    return { error: 'This iMessage channel is not hosted', status: 409 as const }
  }

  const hostedSurfaceId =
    channel.channel_config &&
    typeof channel.channel_config === 'object' &&
    typeof channel.channel_config.hosted_surface_id === 'string'
      ? channel.channel_config.hosted_surface_id
      : null
  if (!hostedSurfaceId) {
    return { error: 'Hosted iMessage surface is missing', status: 409 as const }
  }

  const surface = await getChannelProviderSurface({
    channelType: 'imessage',
    surfaceId: hostedSurfaceId,
  })
  if (!surface || surface.org_id !== params.orgId) {
    return { error: 'Hosted iMessage surface not found', status: 404 as const }
  }

  const surfaceAgents = await listHostedIMessageSurfaceChannels(hostedSurfaceId)
  const aliasesByAssistantId = await buildAssistantAliasMap({
    channelType: 'imessage',
    surfaceOwnerKind: 'imessage_surface',
    surfaceOwnerId: hostedSurfaceId,
    assistantIds: surfaceAgents.map((binding) => binding.assistant_id),
  })
  const surfaceDefault = await getChannelSurfaceDefaultBinding({
    channelType: 'imessage',
    surfaceOwnerKind: 'imessage_surface',
    surfaceOwnerId: hostedSurfaceId,
  })

  const chatId =
    typeof channel.external_channel_id === 'string' && channel.external_channel_id.trim().length > 0
      ? channel.external_channel_id.trim()
      : null
  const chatBindings = chatId
    ? await listHostedIMessageChannelsForChat(chatId)
    : []
  const chatAliases = chatId
    ? await buildAssistantAliasMap({
        channelType: 'imessage',
        surfaceOwnerKind: 'chat',
        surfaceOwnerId: chatId,
        assistantIds: chatBindings.map((binding) => binding.assistant_id),
      })
    : new Map<string, Array<{ id: string; alias: string }>>()

  return {
    channelId: channel.id,
    hostedSurfaceId,
    surface: {
      id: surface.id,
      displayName: surface.display_name,
      status: surface.status,
      lastHeartbeatAt: surface.last_heartbeat_at,
      lastProbeAt: surface.last_probe_at,
      lastError: surface.last_error,
    },
    surfaceAgents: surfaceAgents.map((binding) => ({
      assistantId: binding.assistant_id,
      assistantName: binding.assistant_name,
      assistantDescription: binding.assistant_description,
      bindingChannelId: binding.id,
      aliases: aliasesByAssistantId.get(binding.assistant_id) ?? [],
      isDefault: surfaceDefault?.assistantChannelId === binding.id,
      isCurrentAssistant: binding.assistant_id === params.assistantId,
    })),
    surfaceDefault: surfaceDefault
      ? {
          assistantId: surfaceDefault.assistantId,
          assistantChannelId: surfaceDefault.assistantChannelId,
        }
      : null,
    chatId,
    chatBindings: chatBindings.map((binding) => ({
      assistantId: binding.assistant_id,
      assistantName: binding.assistant_name,
      assistantDescription: binding.assistant_description,
      bindingChannelId: binding.id,
      aliases: chatAliases.get(binding.assistant_id) ?? [],
      isDefault: binding.is_primary,
      isCurrentAssistant: binding.assistant_id === params.assistantId,
    })),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''
    if (channelId) {
      const hosted = await loadHostedSurfaceAdmin({
        assistantId: id,
        orgId: assistant.org_id,
        channelId,
      })
      if ('error' in hosted) {
        return NextResponse.json({ error: hosted.error }, { status: hosted.status })
      }
      return NextResponse.json(hosted)
    }

    const chatId = request.nextUrl.searchParams.get('chatId')?.trim() || ''
    if (!chatId) {
      return NextResponse.json({ error: 'chatId or channelId is required' }, { status: 400 })
    }

    const bindings = await listIMessageChannelsForChat(chatId)
    const foreignBinding = bindings.find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This iMessage chat is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const scopedBindings = bindings.filter(
      (binding) => !binding.org_id || binding.org_id === assistant.org_id,
    )
    const aliasesByAssistantId = await buildAssistantAliasMap({
      channelType: 'imessage',
      surfaceOwnerKind: 'chat',
      surfaceOwnerId: chatId,
      assistantIds: scopedBindings.map((binding) => binding.assistant_id),
    })

    const currentBinding = scopedBindings.find((binding) => binding.assistant_id === id) ?? null
    const defaultBinding = scopedBindings.find((binding) => binding.is_primary) ?? null

    return NextResponse.json({
      chatId,
      bindings: scopedBindings.map((binding) => ({
        assistantId: binding.assistant_id,
        assistantName: binding.assistant_name,
        assistantDescription: binding.assistant_description,
        bindingChannelId: binding.id,
        aliases: aliasesByAssistantId.get(binding.assistant_id) ?? [],
        isDefault: binding.is_primary,
        isCurrentAssistant: binding.assistant_id === id,
      })),
      currentAssistant: currentBinding
        ? {
            assistantId: currentBinding.assistant_id,
            assistantName: currentBinding.assistant_name,
            bindingChannelId: currentBinding.id,
            aliases: aliasesByAssistantId.get(currentBinding.assistant_id) ?? [],
            isDefault: currentBinding.is_primary,
          }
        : null,
      defaultAssistant: defaultBinding
        ? {
            assistantId: defaultBinding.assistant_id,
            assistantName: defaultBinding.assistant_name,
            bindingChannelId: defaultBinding.id,
            aliases: aliasesByAssistantId.get(defaultBinding.assistant_id) ?? [],
            isCurrentAssistant: defaultBinding.assistant_id === id,
          }
        : null,
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/imessage-admin', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-imessage-admin' },
    })
    return NextResponse.json({ error: 'Failed to load iMessage admin data.' }, { status: 500 })
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

    if (parsed.data.action === 'set_surface_default') {
      const hosted = await loadHostedSurfaceAdmin({
        assistantId: id,
        orgId: assistant.org_id,
        channelId: parsed.data.assistantChannelId,
      })
      if ('error' in hosted || hosted.hostedSurfaceId !== parsed.data.hostedSurfaceId) {
        return NextResponse.json({ error: 'This hosted iMessage surface cannot be managed here.' }, { status: 409 })
      }

      await setChannelSurfaceDefault({
        channelType: 'imessage',
        surfaceOwnerKind: 'imessage_surface',
        surfaceOwnerId: parsed.data.hostedSurfaceId,
        assistantId: id,
        assistantChannelId: parsed.data.assistantChannelId,
      })
      return NextResponse.json({ ok: true })
    }

    if (parsed.data.action === 'clear_surface_default') {
      await clearChannelSurfaceDefault({
        channelType: 'imessage',
        surfaceOwnerKind: 'imessage_surface',
        surfaceOwnerId: parsed.data.hostedSurfaceId,
      })
      return NextResponse.json({ ok: true })
    }

    const chatDefaultData = parsed.data.action === 'set_chat_default' ? parsed.data : null
    if (!chatDefaultData) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const bindings = chatDefaultData.hosted
      ? await listHostedIMessageChannelsForChat(chatDefaultData.chatId)
      : await listIMessageChannelsForChat(chatDefaultData.chatId)
    const foreignBinding = bindings.find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This iMessage chat is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const targetBinding = bindings.find((binding) => binding.id === chatDefaultData.bindingChannelId)
    if (!targetBinding || targetBinding.assistant_id !== id) {
      return NextResponse.json(
        { error: 'This iMessage binding does not belong to the current assistant in this workspace.' },
        { status: 409 },
      )
    }

    const switched = chatDefaultData.hosted
      ? await setPrimaryHostedIMessageChannel({
          imessageChatId: chatDefaultData.chatId,
          channelId: chatDefaultData.bindingChannelId,
        })
      : await setPrimaryIMessageChannel({
          imessageChatId: chatDefaultData.chatId,
          channelId: chatDefaultData.bindingChannelId,
        })
    if (!switched) {
      return NextResponse.json({ error: 'Failed to update iMessage chat default.' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/imessage-admin', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-imessage-admin' },
    })
    return NextResponse.json({ error: 'Failed to update iMessage default agent.' }, { status: 500 })
  }
}
