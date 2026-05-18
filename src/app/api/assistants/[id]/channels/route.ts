import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  createAssistantChannel,
  deleteAssistantChannel,
  ensureHostedIMessageSurfaceChannel,
  getAssistant,
  isUserOrgMember,
  listAssistantChannels,
  reactivateAssistantChannelWithSecrets,
  updateHostedDiscordChannelSettings,
} from '@/lib/db'
import {
  createProviderSurfaceToken,
  ensureChannelProviderSurface,
} from '@/lib/db/channel-provider'
import { ErrorService } from '@/lib/errors/error-service'
import { validateDiscordBotToken } from '@/lib/channels/validate-discord-token'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ASSISTANT_CHANNEL_SELECT = 'id, assistant_id, channel_type, secret_token_hash, encrypted_secrets_id, external_channel_id, webhook_url, is_active, created_at, updated_at, connection_mode, inbound_routing_config, channel_config, is_primary'

// ─── Prefix validation ───────────────────────────────────────────────────────
const prefixSchema = z
  .string()
  .max(32, 'Prefix must be 32 characters or less')
  .refine((v) => !v.includes(' '), 'Prefix must not contain spaces')
  .optional()
  .nullable()

// ─── Inbound routing config schema ───────────────────────────────────────────
const inboundRoutingConfigSchema = z
  .object({
    dedicated_channel: z.boolean().optional(),
    prefix: prefixSchema,
    respond_on_mention: z.boolean().optional(),
    thread_support: z.boolean().optional(),
    ignore_bots: z.boolean().optional(),
  })
  .optional()

const hostedDiscordSettingsPatchSchema = z.object({
  channelId: z.string().uuid(),
  dedicatedChannelIds: z.array(z.string().min(1).max(64)).max(25).optional(),
  prefix: prefixSchema,
  respondOnMention: z.boolean().optional(),
  threadSupport: z.boolean().optional(),
  ignoreBots: z.boolean().optional(),
  allowedUsers: z.array(z.string().min(1).max(64)).max(100).optional(),
  ackReaction: z.string().trim().max(64).nullable().optional(),
  typingReaction: z.string().trim().max(64).nullable().optional(),
  streamingPreview: z.boolean().optional(),
  streamingMode: z.enum(['off', 'partial', 'block', 'progress']).optional(),
  replyToMode: z.enum(['off', 'first', 'all']).optional(),
  threadHistoryScope: z.enum(['thread', 'channel']).optional(),
  threadInheritParent: z.boolean().optional(),
  threadInitialHistoryLimit: z.number().int().min(0).nullable().optional(),
  maxLinesPerMessage: z.number().int().min(4).max(40).optional(),
  chunkMode: z.enum(['length', 'newline']).optional(),
}).refine(
  (value) =>
    value.dedicatedChannelIds !== undefined ||
    value.prefix !== undefined ||
    value.respondOnMention !== undefined ||
    value.threadSupport !== undefined ||
    value.ignoreBots !== undefined ||
    value.allowedUsers !== undefined ||
    value.ackReaction !== undefined ||
    value.typingReaction !== undefined ||
    value.streamingPreview !== undefined ||
    value.streamingMode !== undefined ||
    value.replyToMode !== undefined ||
    value.threadHistoryScope !== undefined ||
    value.threadInheritParent !== undefined ||
    value.threadInitialHistoryLimit !== undefined ||
    value.maxLinesPerMessage !== undefined ||
    value.chunkMode !== undefined,
  {
    message: 'At least one Discord setting must be provided',
  },
)

// ─── Channel creation schema (expanded for Discord + Slack) ──────────────────
const createChannelSchema = z
  .object({
    channelType: z.enum(['telegram', 'whatsapp', 'web', 'discord', 'slack', 'msteams', 'imessage']),
    connectionMode: z.enum(['byob', 'hosted']).default('byob'),

    // Secrets (BYOB mode) — NEVER stored in channel_config or metadata
    botToken: z.string().optional(),
    appToken: z.string().optional(), // Slack Socket Mode (xapp-...)
    signingSecret: z.string().optional(), // Slack HTTP mode / future channel types
    phoneNumber: z.string().optional(), // WhatsApp display number / recipient number
    phoneNumberId: z.string().optional(), // WhatsApp Cloud API phone_number_id
    appSecret: z.string().optional(), // WhatsApp Meta app secret
    verifyToken: z.string().optional(), // WhatsApp webhook verification token
    businessAccountId: z.string().optional(), // WhatsApp WABA id
    appId: z.string().optional(), // Teams app registration client ID
    appPassword: z.string().optional(), // Teams app registration client secret
    tenantId: z.string().optional(), // Teams tenant ID or "common"
    cliPath: z.string().optional(), // iMessage imsg binary path
    dbPath: z.string().optional(), // iMessage Messages DB path override
    service: z.string().optional(), // iMessage service (imessage/sms/auto)
    region: z.string().optional(), // iMessage region
    accountId: z.string().optional(), // OpenClaw iMessage account ID

    // Non-secret config
    channelId: z.string().optional(), // External channel/chat ID
    inboundRoutingConfig: inboundRoutingConfigSchema,
  })
  .superRefine((data, ctx) => {
    // Discord BYOB requires botToken + channelId
    if (data.channelType === 'discord' && data.connectionMode === 'byob') {
      if (!data.botToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'botToken is required for Discord BYOB channel',
          path: ['botToken'],
        })
      }
      if (!data.channelId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'channelId is required for Discord BYOB channel',
          path: ['channelId'],
        })
      }
    }

    // Telegram BYOB requires botToken
    if (data.channelType === 'telegram' && data.connectionMode === 'byob') {
      if (!data.botToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'botToken is required for Telegram BYOB channel',
          path: ['botToken'],
        })
      }
    }

    // WhatsApp BYOB requires Cloud API credentials + phone number ID.
    if (data.channelType === 'whatsapp' && data.connectionMode === 'byob') {
      if (!data.botToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'botToken is required for WhatsApp BYOB channel',
          path: ['botToken'],
        })
      }
      if (!data.phoneNumberId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'phoneNumberId is required for WhatsApp BYOB channel',
          path: ['phoneNumberId'],
        })
      }
      if (!data.appSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'appSecret is required for WhatsApp BYOB channel',
          path: ['appSecret'],
        })
      }
      if (!data.verifyToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'verifyToken is required for WhatsApp BYOB channel',
          path: ['verifyToken'],
        })
      }
    }

    // Slack BYOB requires botToken + appToken (for Socket Mode)
    if (data.channelType === 'slack' && data.connectionMode === 'byob') {
      if (!data.botToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'botToken (xoxb-...) is required for Slack BYOB channel',
          path: ['botToken'],
        })
      }
      if (!data.appToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'appToken (xapp-...) is required for Slack Socket Mode',
          path: ['appToken'],
        })
      }
    }

    // Teams BYOB requires app credentials
    if (data.channelType === 'msteams' && data.connectionMode === 'byob') {
      if (!data.appId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'appId is required for Microsoft Teams BYOB channel',
          path: ['appId'],
        })
      }
      if (!data.appPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'appPassword is required for Microsoft Teams BYOB channel',
          path: ['appPassword'],
        })
      }
      if (!data.tenantId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tenantId is required for Microsoft Teams BYOB channel',
          path: ['tenantId'],
        })
      }
    }

    // Validate prefix if provided: trim + enforce constraints
    if (data.inboundRoutingConfig?.prefix) {
      const trimmed = data.inboundRoutingConfig.prefix.trim()
      if (trimmed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Prefix cannot be empty after trimming',
          path: ['inboundRoutingConfig', 'prefix'],
        })
      }
    }
  })

export async function GET(
  _request: NextRequest,
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

    const channels = await listAssistantChannels(id)
    return NextResponse.json({ channels })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/channels', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-channels' },
    })
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
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

    const body = await request.json()
    const validated = createChannelSchema.parse(body)

    // ─── Discord BYOB: live-validate the bot token before persisting ────────
    // Catches revoked/typo tokens up front so operators see a clear error in
    // the UI instead of a silent deactivation once the runtime boots. See
    // worker/src/channels/discord/DiscordNativeAdapter.ts for the runtime-side
    // counterpart.
    if (
      validated.channelType === 'discord' &&
      validated.connectionMode === 'byob' &&
      validated.botToken
    ) {
      const tokenCheck = await validateDiscordBotToken(validated.botToken)
      if (!tokenCheck.ok) {
        const message =
          tokenCheck.reason === 'invalid'
            ? 'Discord rejected this bot token (401). Double-check the token from the Discord Developer Portal.'
            : tokenCheck.reason === 'forbidden'
              ? 'Discord rejected this bot token (403). The token is valid but lacks permission to read /users/@me.'
              : tokenCheck.reason === 'rate_limited'
                ? 'Discord rate-limited the validation request. Try again in a moment.'
                : tokenCheck.reason === 'server_error'
                  ? 'Discord returned a server error while validating the bot token. Try again shortly.'
                  : 'Could not reach Discord to validate the bot token. Check your network and try again.'
        return NextResponse.json(
          {
            error: 'Discord bot token validation failed',
            reason: tokenCheck.reason,
            details: message,
          },
          { status: 400 },
        )
      }
    }

    // ─── Build secrets (ONLY tokens/credentials — never in config/metadata) ──
    const secrets: Record<string, string> = {}

    if (validated.botToken) {
      secrets.bot_token = validated.botToken
    }
    if (validated.appToken) {
      secrets.app_token = validated.appToken
    }
    if (validated.signingSecret) {
      secrets.signing_secret = validated.signingSecret
    }
    if (validated.channelType === 'whatsapp' && validated.phoneNumber) {
      secrets.phone_number = validated.phoneNumber
    }
    if (validated.channelType === 'whatsapp') {
      if (validated.botToken) {
        secrets.access_token = validated.botToken
      }
      if (validated.phoneNumberId) {
        secrets.phone_number_id = validated.phoneNumberId
      }
      if (validated.appSecret) {
        secrets.app_secret = validated.appSecret
      }
      if (validated.verifyToken) {
        secrets.verify_token = validated.verifyToken
      }
      if (validated.businessAccountId) {
        secrets.business_account_id = validated.businessAccountId
      }
    }
    if (validated.channelType === 'msteams') {
      if (validated.appId) {
        secrets.app_id = validated.appId
      }
      if (validated.appPassword) {
        secrets.app_password = validated.appPassword
      }
      if (validated.tenantId) {
        secrets.tenant_id = validated.tenantId
      }
    }
    if (validated.channelType === 'imessage') {
      if (validated.cliPath) {
        secrets.cli_path = validated.cliPath
      }
      if (validated.dbPath) {
        secrets.db_path = validated.dbPath
      }
      if (validated.service) {
        secrets.service = validated.service
      }
      if (validated.region) {
        secrets.region = validated.region
      }
      if (validated.accountId) {
        secrets.account_id = validated.accountId
      }
    }

    // ─── Build routing config (trim prefix if present) ──────────────────────
    let routingConfig = validated.inboundRoutingConfig || undefined
    if (routingConfig?.prefix) {
      routingConfig = { ...routingConfig, prefix: routingConfig.prefix.trim() }
    }

    let channel: Record<string, unknown>
    let secretToken: string | undefined

    if (validated.channelType === 'imessage' && validated.connectionMode === 'hosted') {
      const surfaceToken = createProviderSurfaceToken()
      const surface = await ensureChannelProviderSurface({
        channelType: 'imessage',
        orgId: assistant.org_id,
        surfaceOwnerId: `org:${assistant.org_id}`,
        displayName: `${assistant.name} iMessage`,
        status: 'pending',
        config: {
          hosted: true,
        },
        secretToken: surfaceToken,
      })
      const { channelId } = await ensureHostedIMessageSurfaceChannel({
        assistantId: id,
        hostedSurfaceId: surface.id,
      })
      const supabase = createServiceClient()
      const { data: hostedChannel, error: hostedChannelError } = await supabase
        .from('assistant_channels')
        .select(ASSISTANT_CHANNEL_SELECT)
        .eq('id', channelId)
        .single()
      if (hostedChannelError || !hostedChannel) {
        throw hostedChannelError ?? new Error('Failed to load hosted iMessage channel')
      }
      channel = hostedChannel as Record<string, unknown>
      secretToken = surfaceToken
    } else {
      const created = await createAssistantChannel({
        assistantId: id,
        channelType: validated.channelType,
        secrets,
        // Pass extra fields if the DB function supports them
        ...((validated.channelType === 'whatsapp' ? validated.phoneNumberId : validated.channelId) && {
          externalChannelId:
            validated.channelType === 'whatsapp' ? validated.phoneNumberId : validated.channelId,
        }),
        ...(validated.connectionMode && { connectionMode: validated.connectionMode }),
        ...(routingConfig && { inboundRoutingConfig: routingConfig }),
      })
      channel = created.channel as Record<string, unknown>
      secretToken = created.secretToken
    }

    // Build webhook URL for webhook-based channels
    const webhookUrl = (validated.channelType === 'telegram' || validated.channelType === 'whatsapp' || (validated.channelType === 'imessage' && validated.connectionMode === 'byob'))
      ? `${request.nextUrl.origin}/api/webhooks/${channel.channel_type}/${channel.id}`
      : undefined

    return NextResponse.json(
      {
        channel,
        webhookUrl,
        ...(validated.channelType === 'imessage'
          ? { webhookSecret: secretToken }
          : {}),
        ...(validated.channelType === 'whatsapp' && validated.connectionMode === 'byob'
          ? { webhookVerifyToken: validated.verifyToken ?? null }
          : {}),
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/channels', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-channels' },
    })
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
  }
}

/**
 * PATCH — Reactivate a deactivated channel (e.g., after fixing credentials).
 * Updates encrypted secrets + sets is_active=true + clears error metadata.
 */
export async function PATCH(
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

    const body = await request.json()
    const settingsPatch = hostedDiscordSettingsPatchSchema.safeParse(body)
    if (settingsPatch.success) {
      await updateHostedDiscordChannelSettings({
        channelId: settingsPatch.data.channelId,
        ...(settingsPatch.data.dedicatedChannelIds !== undefined
          ? { dedicatedChannelIds: settingsPatch.data.dedicatedChannelIds }
          : {}),
        ...(settingsPatch.data.prefix !== undefined
          ? { prefix: settingsPatch.data.prefix }
          : {}),
        ...(settingsPatch.data.respondOnMention !== undefined
          ? { respondOnMention: settingsPatch.data.respondOnMention }
          : {}),
        ...(settingsPatch.data.threadSupport !== undefined
          ? { threadSupport: settingsPatch.data.threadSupport }
          : {}),
        ...(settingsPatch.data.ignoreBots !== undefined
          ? { ignoreBots: settingsPatch.data.ignoreBots }
          : {}),
        ...(settingsPatch.data.allowedUsers !== undefined
          ? { allowedUserIds: settingsPatch.data.allowedUsers }
          : {}),
        ...(settingsPatch.data.ackReaction !== undefined
          ? { ackReaction: settingsPatch.data.ackReaction }
          : {}),
        ...(settingsPatch.data.typingReaction !== undefined
          ? { typingReaction: settingsPatch.data.typingReaction }
          : {}),
        ...(settingsPatch.data.streamingPreview !== undefined
          ? { streamingPreview: settingsPatch.data.streamingPreview }
          : {}),
        ...(settingsPatch.data.streamingMode !== undefined
          ? { streamingMode: settingsPatch.data.streamingMode }
          : {}),
        ...(settingsPatch.data.replyToMode !== undefined
          ? { replyToMode: settingsPatch.data.replyToMode }
          : {}),
        ...(settingsPatch.data.threadHistoryScope !== undefined
          ? { threadHistoryScope: settingsPatch.data.threadHistoryScope }
          : {}),
        ...(settingsPatch.data.threadInheritParent !== undefined
          ? { threadInheritParent: settingsPatch.data.threadInheritParent }
          : {}),
        ...(settingsPatch.data.threadInitialHistoryLimit !== undefined
          ? { threadInitialHistoryLimit: settingsPatch.data.threadInitialHistoryLimit }
          : {}),
        ...(settingsPatch.data.maxLinesPerMessage !== undefined
          ? { maxLinesPerMessage: settingsPatch.data.maxLinesPerMessage }
          : {}),
        ...(settingsPatch.data.chunkMode !== undefined
          ? { chunkMode: settingsPatch.data.chunkMode }
          : {}),
      })

      return NextResponse.json({ success: true, updated: true })
    }

    const { channelId, botToken, appToken, signingSecret, phoneNumber, phoneNumberId, appSecret, verifyToken, businessAccountId } = body as {
      channelId: string
      botToken?: string
      appToken?: string
      signingSecret?: string
      phoneNumber?: string
      phoneNumberId?: string
      appSecret?: string
      verifyToken?: string
      businessAccountId?: string
    }

    if (!channelId || typeof channelId !== 'string') {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
    }

    // Build new secrets
    const secrets: Record<string, string> = {}
    if (botToken) secrets.bot_token = botToken
    if (appToken) secrets.app_token = appToken
    if (signingSecret) secrets.signing_secret = signingSecret
    if (phoneNumber) secrets.phone_number = phoneNumber
    if (phoneNumberId) secrets.phone_number_id = phoneNumberId
    if (appSecret) secrets.app_secret = appSecret
    if (verifyToken) secrets.verify_token = verifyToken
    if (businessAccountId) secrets.business_account_id = businessAccountId

    if (Object.keys(secrets).length === 0) {
      return NextResponse.json(
        { error: 'At least one credential (botToken or signingSecret) is required' },
        { status: 400 },
      )
    }

    await reactivateAssistantChannelWithSecrets({ channelId, secrets })

    return NextResponse.json({ success: true, reactivated: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/channels', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-channels' },
    })
    return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 })
  }
}

export async function DELETE(
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

    const body = await request.json()
    const channelId = body?.channelId

    if (!channelId || typeof channelId !== 'string') {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
    }

    await deleteAssistantChannel(channelId)
    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/channels', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-channels' },
    })
    return NextResponse.json({ error: 'Failed to delete channel' }, { status: 500 })
  }
}
