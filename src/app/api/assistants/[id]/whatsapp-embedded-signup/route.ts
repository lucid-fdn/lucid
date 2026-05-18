import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  createAssistantChannel,
  getAssistant,
  isUserOrgMember,
  listAssistantChannels,
  reactivateAssistantChannelWithSecrets,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { FEATURES } from '@/lib/features'
import { createServiceClient } from '@/lib/supabase/server'
import {
  exchangeWhatsAppEmbeddedSignupCode,
  getWhatsAppEmbeddedSignupConfig,
} from '@/lib/whatsapp/embedded-signup'

export const dynamic = 'force-dynamic'

const ASSISTANT_CHANNEL_SELECT = 'id, assistant_id, channel_type, secret_token_hash, encrypted_secrets_id, external_channel_id, webhook_url, is_active, created_at, updated_at, connection_mode, inbound_routing_config, channel_config, is_primary'

const finalizeSchema = z.object({
  code: z.string().min(1),
  phoneNumberId: z.string().min(1),
  phoneNumber: z.string().trim().optional().nullable(),
  businessAccountId: z.string().trim().optional().nullable(),
})

function getEmbeddedSignupLaunchUrl(params: { appId: string; configId: string }): string {
  const url = new URL('https://www.facebook.com/dialog/oauth')
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('config_id', params.configId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('override_default_response_type', 'true')
  url.searchParams.set(
    'extras',
    JSON.stringify({
      sessionInfoVersion: '3',
      version: 'v3',
      feature: 'whatsapp_embedded_signup',
      nonce: crypto.randomUUID(),
    }),
  )
  return url.toString()
}

async function assertAssistantAccess(assistantId: string) {
  const userId = await getUserId()
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const assistant = await getAssistant(assistantId)
  if (!assistant) {
    return { error: NextResponse.json({ error: 'Assistant not found' }, { status: 404 }) }
  }

  const isMember = await isUserOrgMember(userId, assistant.org_id)
  if (!isMember) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { userId, assistant }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await assertAssistantAccess(id)
    if ('error' in access) return access.error

    if (!FEATURES.whatsappEmbeddedSignup) {
      return NextResponse.json(
        {
          enabled: false,
          error: 'WhatsApp Embedded Signup is disabled on this deployment',
          details:
            'Enable FEATURE_WHATSAPP_EMBEDDED_SIGNUP and configure WHATSAPP_EMBEDDED_SIGNUP_APP_ID, WHATSAPP_EMBEDDED_SIGNUP_APP_SECRET, and WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID to turn on Meta Embedded Signup.',
        },
        { status: 501 },
      )
    }

    let config
    try {
      config = getWhatsAppEmbeddedSignupConfig()
    } catch {
      return NextResponse.json(
        {
          enabled: false,
          error: 'WhatsApp Embedded Signup is not fully configured',
          details:
            'Set WHATSAPP_EMBEDDED_SIGNUP_APP_ID, WHATSAPP_EMBEDDED_SIGNUP_APP_SECRET, and WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID before launching Embedded Signup.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json({
      enabled: true,
      appId: config.appId,
      configId: config.configId,
      launchUrl: getEmbeddedSignupLaunchUrl({
        appId: config.appId,
        configId: config.configId,
      }),
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-embedded-signup', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-whatsapp-embedded-signup' },
    })
    return NextResponse.json({ error: 'Failed to prepare WhatsApp Embedded Signup' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await assertAssistantAccess(id)
    if ('error' in access) return access.error

    if (!FEATURES.whatsappEmbeddedSignup) {
      return NextResponse.json(
        { error: 'WhatsApp Embedded Signup is disabled on this deployment' },
        { status: 501 },
      )
    }

    const config = getWhatsAppEmbeddedSignupConfig()
    const body = finalizeSchema.parse(await request.json())
    const accessToken = await exchangeWhatsAppEmbeddedSignupCode({
      appId: config.appId,
      appSecret: config.appSecret,
      code: body.code,
    })
    const verifyToken = crypto.randomUUID()
    const secrets: Record<string, string> = {
      access_token: accessToken,
      phone_number_id: body.phoneNumberId,
      app_secret: config.appSecret,
      verify_token: verifyToken,
    }
    if (body.phoneNumber) {
      secrets.phone_number = body.phoneNumber
    }
    if (body.businessAccountId) {
      secrets.business_account_id = body.businessAccountId
    }

    const existingChannel = (await listAssistantChannels(id)).find(
      (channel) => channel.channel_type === 'whatsapp' && channel.connection_mode === 'byob',
    )

    let channel: Record<string, unknown>

    if (existingChannel) {
      await reactivateAssistantChannelWithSecrets({
        channelId: existingChannel.id,
        secrets,
      })

      const supabase = createServiceClient()
      const { data: updatedChannel, error: updateError } = await supabase
        .from('assistant_channels')
        .update({
          external_channel_id: body.phoneNumberId,
          is_active: true,
        })
        .eq('id', existingChannel.id)
        .select(ASSISTANT_CHANNEL_SELECT)
        .single()

      if (updateError || !updatedChannel) {
        throw updateError ?? new Error('Failed to update WhatsApp BYOB channel')
      }

      channel = updatedChannel as Record<string, unknown>
    } else {
      const created = await createAssistantChannel({
        assistantId: id,
        channelType: 'whatsapp',
        connectionMode: 'byob',
        externalChannelId: body.phoneNumberId,
        secrets,
      })
      channel = created.channel as Record<string, unknown>
    }

    return NextResponse.json({
      channel,
      webhookUrl: `${request.nextUrl.origin}/api/webhooks/whatsapp/${channel.id}`,
      webhookVerifyToken: verifyToken,
      phoneNumberId: body.phoneNumberId,
      businessAccountId: body.businessAccountId ?? null,
      connectionMode: 'byob',
      source: 'embedded_signup',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/whatsapp-embedded-signup', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-whatsapp-embedded-signup' },
    })
    return NextResponse.json({ error: 'Failed to finalize WhatsApp Embedded Signup' }, { status: 500 })
  }
}
