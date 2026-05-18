import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  ensureHostedIMessageSurfaceChannel,
  getAssistant,
  isUserOrgMember,
} from '@/lib/db'
import { getChannelSurfaceDefaultBinding, setChannelSurfaceDefault } from '@/lib/db/channel-routing'
import {
  createProviderSurfaceToken,
  ensureChannelProviderSurface,
  getChannelProviderSurface,
} from '@/lib/db/channel-provider'
import { ErrorService } from '@/lib/errors/error-service'
import { createServiceClient } from '@/lib/supabase/server'
import { hashChannelSecret } from '@/lib/channels/secrets'

export const dynamic = 'force-dynamic'

const ASSISTANT_CHANNEL_SELECT = 'id, assistant_id, channel_type, secret_token_hash, encrypted_secrets_id, external_channel_id, webhook_url, is_active, created_at, updated_at, connection_mode, inbound_routing_config, channel_config, is_primary'

function buildHostedProviderConfig(params: {
  origin: string
  surfaceId: string
  surfaceToken: string
}) {
  const baseUrl = params.origin.replace(/\/$/, '')
  return {
    surfaceId: params.surfaceId,
    surfaceToken: params.surfaceToken,
    heartbeatUrl: `${baseUrl}/api/internal/imessage/provider-heartbeat`,
    dispatchUrl: `${baseUrl}/api/internal/imessage/provider-dispatch`,
    ingressUrl: `${baseUrl}/api/internal/imessage/hosted`,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      request.nextUrl.origin

    const body = (await request.json().catch(() => null)) as { channelId?: string } | null
    const requestedChannelId = typeof body?.channelId === 'string' ? body.channelId.trim() : ''

    if (!requestedChannelId) {
      const surfaceToken = createProviderSurfaceToken()
      const surface = await ensureChannelProviderSurface({
        channelType: 'imessage',
        orgId: assistant.org_id,
        surfaceOwnerId: `org:${assistant.org_id}`,
        displayName: `${assistant.name} iMessage`,
        status: 'pending',
        config: { hosted: true },
        secretToken: surfaceToken,
      })

      const { channelId } = await ensureHostedIMessageSurfaceChannel({
        assistantId: id,
        hostedSurfaceId: surface.id,
      })

      const existingDefault = await getChannelSurfaceDefaultBinding({
        channelType: 'imessage',
        surfaceOwnerKind: 'imessage_surface',
        surfaceOwnerId: surface.id,
      })
      if (!existingDefault) {
        await setChannelSurfaceDefault({
          channelType: 'imessage',
          surfaceOwnerKind: 'imessage_surface',
          surfaceOwnerId: surface.id,
          assistantId: id,
          assistantChannelId: channelId,
        })
      }

      const supabase = createServiceClient()
      const { data: hostedChannel, error: hostedChannelError } = await supabase
        .from('assistant_channels')
        .select(ASSISTANT_CHANNEL_SELECT)
        .eq('id', channelId)
        .single()

      if (hostedChannelError || !hostedChannel) {
        throw hostedChannelError ?? new Error('Hosted iMessage channel not found')
      }

      return NextResponse.json({
        channel: hostedChannel,
        hosted: true,
        providerConfig: buildHostedProviderConfig({
          origin,
          surfaceId: surface.id,
          surfaceToken,
        }),
      })
    }

    const supabase = createServiceClient()
    const { data: channel, error: channelError } = await supabase
      .from('assistant_channels')
      .select('id, connection_mode, channel_config')
      .eq('id', requestedChannelId)
      .eq('assistant_id', id)
      .eq('channel_type', 'imessage')
      .maybeSingle()

    if (channelError) throw channelError
    if (!channel) {
      return NextResponse.json({ error: 'iMessage channel not found' }, { status: 404 })
    }

    if (channel.connection_mode === 'hosted') {
      const surfaceId =
        channel.channel_config &&
        typeof channel.channel_config === 'object' &&
        typeof channel.channel_config.hosted_surface_id === 'string'
          ? channel.channel_config.hosted_surface_id
          : null
      if (!surfaceId) {
        return NextResponse.json({ error: 'Hosted iMessage surface is missing' }, { status: 409 })
      }

      const existingSurface = await getChannelProviderSurface({
        channelType: 'imessage',
        surfaceId,
      })
      if (!existingSurface) {
        return NextResponse.json({ error: 'Hosted iMessage surface not found' }, { status: 404 })
      }

      const surfaceToken = createProviderSurfaceToken()
      const rotatedSurface = await ensureChannelProviderSurface({
        channelType: 'imessage',
        orgId: existingSurface.org_id,
        surfaceOwnerId: existingSurface.surface_owner_id,
        displayName: existingSurface.display_name,
        status: existingSurface.status,
        config:
          existingSurface.config && typeof existingSurface.config === 'object'
            ? existingSurface.config
            : {},
        secretToken: surfaceToken,
      })

      return NextResponse.json({
        channel: { id: requestedChannelId },
        hosted: true,
        providerConfig: buildHostedProviderConfig({
          origin,
          surfaceId: rotatedSurface.id,
          surfaceToken,
        }),
      })
    }

    const webhookSecret = crypto.randomUUID()
    const { error: updateError } = await supabase
      .from('assistant_channels')
      .update({ secret_token_hash: hashChannelSecret(webhookSecret) })
      .eq('id', requestedChannelId)

    if (updateError) throw updateError

    const webhookUrl = `${origin.replace(/\/$/, '')}/api/webhooks/imessage/${requestedChannelId}`

    return NextResponse.json({
      channelId: requestedChannelId,
      webhookUrl,
      webhookSecret,
      samplePayload: {
        messageId: 'imsg-message-123',
        chatId: 'chat_guid:iMessage;-;+15555550123',
        senderId: '+15555550123',
        senderName: 'Contact name',
        text: 'hello from imessage',
        timestamp: new Date().toISOString(),
      },
      bridgeHeaders: {
        'x-lucid-webhook-secret': webhookSecret,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/imessage-connect', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-imessage-connect' },
    })
    return NextResponse.json({ error: 'Failed to generate iMessage bridge config' }, { status: 500 })
  }
}
