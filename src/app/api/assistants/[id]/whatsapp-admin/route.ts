import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  listWhatsAppChannelsForChat,
  setPrimaryWhatsAppChannel,
} from '@/lib/db'
import {
  buildAssistantAliasMap,
  ChannelAdminRouteError,
  requireAssistantChannelAdminAccess,
} from '@/lib/channels/admin-route-helpers'
import {
  getChannelSurfaceDefaultBinding,
  setChannelSurfaceDefault,
  clearChannelSurfaceDefault,
} from '@/lib/db/channel-routing'
import { ErrorService } from '@/lib/errors/error-service'
import { createServiceClient } from '@/lib/supabase/server'
import { getChannelSecrets } from '@/lib/whatsapp/webhook'

export const dynamic = 'force-dynamic'

async function loadByobWhatsAppSetup(params: {
  assistantId: string
  orgId: string
  channelId: string
  origin: string
}) {
  const supabase = createServiceClient()
  const { data: channel, error: channelError } = await supabase
    .from('assistant_channels')
    .select(
      'id, assistant_id, connection_mode, is_active, external_channel_id, encrypted_secrets, ai_assistants!inner(org_id)',
    )
    .eq('id', params.channelId)
    .eq('assistant_id', params.assistantId)
    .eq('channel_type', 'whatsapp')
    .maybeSingle()

  if (channelError || !channel) {
    return { error: 'WhatsApp channel not found', status: 404 as const }
  }

  const ai = Array.isArray(channel.ai_assistants) ? channel.ai_assistants[0] : channel.ai_assistants
  if (ai?.org_id && ai.org_id !== params.orgId) {
    return { error: 'This WhatsApp channel belongs to another workspace.', status: 409 as const }
  }

  if (channel.connection_mode !== 'byob') {
    return { error: 'This WhatsApp channel is not BYOB.', status: 409 as const }
  }

  const secrets = getChannelSecrets(channel, '[assistant-whatsapp-admin]')
  const phoneNumberId =
    typeof secrets.phone_number_id === 'string' && secrets.phone_number_id.trim().length > 0
      ? secrets.phone_number_id.trim()
      : typeof channel.external_channel_id === 'string' && channel.external_channel_id.trim().length > 0
        ? channel.external_channel_id.trim()
        : null

  return {
    mode: 'byob' as const,
    channelId: channel.id,
    isActive: channel.is_active === true,
    webhookUrl: `${params.origin}/api/webhooks/whatsapp/${channel.id}`,
    verifyToken:
      typeof secrets.verify_token === 'string' && secrets.verify_token.trim().length > 0
        ? secrets.verify_token.trim()
        : null,
    phoneNumber:
      typeof secrets.phone_number === 'string' && secrets.phone_number.trim().length > 0
        ? secrets.phone_number.trim()
        : null,
    phoneNumberId,
    businessAccountId:
      typeof secrets.business_account_id === 'string' && secrets.business_account_id.trim().length > 0
        ? secrets.business_account_id.trim()
        : null,
    hasAccessToken:
      typeof secrets.access_token === 'string' && secrets.access_token.trim().length > 0,
    hasAppSecret:
      typeof secrets.app_secret === 'string' && secrets.app_secret.trim().length > 0,
  }
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_chat_default'),
    chatId: z.string().min(1),
    bindingChannelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('set_surface_default'),
    hostedSurfaceId: z.string().min(1),
    assistantChannelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('clear_surface_default'),
    hostedSurfaceId: z.string().min(1),
  }),
])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { assistant } = await requireAssistantChannelAdminAccess(id)

    const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''
    if (channelId) {
      const byob = await loadByobWhatsAppSetup({
        assistantId: id,
        orgId: assistant.org_id,
        channelId,
        origin: request.nextUrl.origin,
      })
      if ('error' in byob) {
        return NextResponse.json({ error: byob.error }, { status: byob.status })
      }
      return NextResponse.json(byob)
    }

    const chatId = request.nextUrl.searchParams.get('chatId')?.trim() || ''
    const hostedSurfaceId = request.nextUrl.searchParams.get('hostedSurfaceId')?.trim() || ''
    if (!chatId) {
      return NextResponse.json({ error: 'chatId or channelId is required' }, { status: 400 })
    }

    const bindings = await listWhatsAppChannelsForChat(chatId)
    const foreignBinding = bindings.find(
      (binding) => binding.org_id && binding.org_id !== assistant.org_id,
    )
    if (foreignBinding) {
      return NextResponse.json(
        { error: 'This WhatsApp chat is linked to another workspace and cannot be managed here.' },
        { status: 409 },
      )
    }

    const scopedBindings = bindings.filter(
      (binding) => !binding.org_id || binding.org_id === assistant.org_id,
    )
    const aliasesByAssistantId = await buildAssistantAliasMap({
      channelType: 'whatsapp',
      surfaceOwnerKind: 'chat',
      surfaceOwnerId: chatId,
      assistantIds: scopedBindings.map((binding) => binding.assistant_id),
    })

    const currentBinding = scopedBindings.find((binding) => binding.assistant_id === id) ?? null
    const defaultBinding = scopedBindings.find((binding) => binding.is_primary) ?? null

    const surfaceDefault =
      hostedSurfaceId.length > 0
        ? await getChannelSurfaceDefaultBinding({
            channelType: 'whatsapp',
            surfaceOwnerKind: 'hosted_surface',
            surfaceOwnerId: hostedSurfaceId,
          })
        : null

    let surfaceAgents: Array<{
      assistantId: string
      assistantName: string
      assistantDescription: string | null
      bindingChannelId: string
      isCurrentAssistant: boolean
      isSurfaceDefault: boolean
      boundChatId: string | null
    }> = []

    if (hostedSurfaceId.length > 0) {
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('assistant_channels')
        .select('id, assistant_id, external_channel_id, ai_assistants!inner(org_id, name, description)')
        .eq('channel_type', 'whatsapp')
        .eq('connection_mode', 'hosted')
        .eq('is_active', true)
        .filter('channel_config->>hosted_surface_id', 'eq', hostedSurfaceId)
        .order('name', { ascending: true, referencedTable: 'ai_assistants' })

      if (error) {
        throw error
      }

      const foreignSurfaceRow = (data ?? []).find((row: {
        ai_assistants:
          | { org_id?: string | null; name: string; description: string | null }
          | Array<{ org_id?: string | null; name: string; description: string | null }>
      }) => {
        const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
        return ai?.org_id && ai.org_id !== assistant.org_id
      })
      if (foreignSurfaceRow) {
        return NextResponse.json(
          { error: 'This hosted WhatsApp number is linked to another workspace and cannot be managed here.' },
          { status: 409 },
        )
      }

      const seenAssistantIds = new Set<string>()
      surfaceAgents = (data ?? []).flatMap((row: {
        id: string
        assistant_id: string
        external_channel_id: string | null
        ai_assistants:
          | { org_id?: string | null; name: string; description: string | null }
          | Array<{ org_id?: string | null; name: string; description: string | null }>
      }) => {
        if (seenAssistantIds.has(row.assistant_id)) return []
        seenAssistantIds.add(row.assistant_id)
        const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
        return [{
          assistantId: row.assistant_id,
          assistantName: ai?.name ?? 'Untitled agent',
          assistantDescription: ai?.description ?? null,
          bindingChannelId: row.id,
          isCurrentAssistant: row.assistant_id === id,
          isSurfaceDefault: surfaceDefault?.assistantId === row.assistant_id,
          boundChatId: row.external_channel_id,
        }]
      })
    }

    return NextResponse.json({
      chatId,
      hostedSurfaceId: hostedSurfaceId || null,
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
      surfaceDefault: surfaceDefault
        ? {
            assistantId: surfaceDefault.assistantId,
            assistantChannelId: surfaceDefault.assistantChannelId,
            assistantName:
              surfaceAgents.find((agent) => agent.assistantId === surfaceDefault.assistantId)
                ?.assistantName ?? 'Untitled agent',
            isCurrentAssistant: surfaceDefault.assistantId === id,
          }
        : null,
      surfaceAgents,
    })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-admin', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-whatsapp-admin' },
    })
    return NextResponse.json({ error: 'Failed to load WhatsApp admin data.' }, { status: 500 })
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

    if (parsed.data.action === 'set_chat_default') {
      const payload = parsed.data
      const bindings = await listWhatsAppChannelsForChat(payload.chatId)
      const foreignBinding = bindings.find(
        (binding) => binding.org_id && binding.org_id !== assistant.org_id,
      )
      if (foreignBinding) {
        return NextResponse.json(
          { error: 'This WhatsApp chat is linked to another workspace and cannot be managed here.' },
          { status: 409 },
        )
      }

      const targetBinding = bindings.find((binding) => binding.id === payload.bindingChannelId)
      if (!targetBinding || targetBinding.assistant_id !== id) {
        return NextResponse.json(
          { error: 'This WhatsApp binding does not belong to the current assistant in this workspace.' },
          { status: 409 },
        )
      }

      const switched = await setPrimaryWhatsAppChannel({
        whatsappChatId: payload.chatId,
        channelId: payload.bindingChannelId,
      })
      if (!switched) {
        return NextResponse.json({ error: 'Failed to update WhatsApp chat default.' }, { status: 409 })
      }
      return NextResponse.json({ ok: true })
    }

    if (parsed.data.action === 'set_surface_default') {
      const supabase = createServiceClient()
      const { data: surfaceRows, error: surfaceRowsError } = await supabase
        .from('assistant_channels')
        .select('id, ai_assistants!inner(org_id)')
        .eq('channel_type', 'whatsapp')
        .eq('connection_mode', 'hosted')
        .eq('is_active', true)
        .filter('channel_config->>hosted_surface_id', 'eq', parsed.data.hostedSurfaceId)

      if (surfaceRowsError) {
        throw surfaceRowsError
      }

      const foreignSurfaceRow = (surfaceRows ?? []).find((row: {
        ai_assistants: { org_id?: string | null } | Array<{ org_id?: string | null }>
      }) => {
        const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
        return ai?.org_id && ai.org_id !== assistant.org_id
      })
      if (foreignSurfaceRow) {
        return NextResponse.json(
          { error: 'This hosted WhatsApp number is linked to another workspace and cannot be managed here.' },
          { status: 409 },
        )
      }

      const { data: targetChannel, error: targetChannelError } = await supabase
        .from('assistant_channels')
        .select('id, assistant_id, channel_type, connection_mode, is_active, channel_config, ai_assistants!inner(org_id)')
        .eq('id', parsed.data.assistantChannelId)
        .eq('assistant_id', id)
        .eq('channel_type', 'whatsapp')
        .eq('connection_mode', 'hosted')
        .eq('is_active', true)
        .eq('ai_assistants.org_id', assistant.org_id)
        .maybeSingle()

      const targetConfig =
        targetChannel?.channel_config && typeof targetChannel.channel_config === 'object'
          ? targetChannel.channel_config
          : null
      const targetSurfaceId =
        typeof targetConfig?.hosted_surface_id === 'string' ? targetConfig.hosted_surface_id.trim() : ''

      if (targetChannelError || !targetChannel || targetSurfaceId !== parsed.data.hostedSurfaceId) {
        return NextResponse.json(
          { error: 'This WhatsApp hosted surface default must reference the current assistant on the same hosted number.' },
          { status: 409 },
        )
      }

      await setChannelSurfaceDefault({
        channelType: 'whatsapp',
        surfaceOwnerKind: 'hosted_surface',
        surfaceOwnerId: parsed.data.hostedSurfaceId,
        assistantId: id,
        assistantChannelId: parsed.data.assistantChannelId,
      })
      return NextResponse.json({ ok: true })
    }

    const currentSurfaceDefault = await getChannelSurfaceDefaultBinding({
      channelType: 'whatsapp',
      surfaceOwnerKind: 'hosted_surface',
      surfaceOwnerId: parsed.data.hostedSurfaceId,
    })
    if (!currentSurfaceDefault || currentSurfaceDefault.assistantId !== id) {
      return NextResponse.json({ error: 'Only the current default agent can clear it.' }, { status: 409 })
    }
    await clearChannelSurfaceDefault({
      channelType: 'whatsapp',
      surfaceOwnerKind: 'hosted_surface',
      surfaceOwnerId: parsed.data.hostedSurfaceId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChannelAdminRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-admin', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-whatsapp-admin' },
    })
    return NextResponse.json({ error: 'Failed to update WhatsApp admin settings.' }, { status: 500 })
  }
}
