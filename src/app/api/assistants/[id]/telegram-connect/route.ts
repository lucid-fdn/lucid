import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  createTelegramConnectToken,
  getAssistant,
  isUserOrgMember,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { appendTelegramServerLog } from '@/lib/logging/telegram-server-log'
import { syncHostedTelegramSurface } from '@/lib/telegram/bot-commands'

export const dynamic = 'force-dynamic'

type TelegramGetMeResponse = {
  ok?: boolean
  result?: {
    id?: number
    username?: string
    first_name?: string
  }
  description?: string
}

async function getTelegramWebhookInfo(botToken: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
    method: 'GET',
  })

  if (!res.ok) return null

  const payload = (await res.json()) as {
    ok?: boolean
    result?: {
      url?: string
      pending_update_count?: number
      last_error_date?: number
      last_error_message?: string
    }
  }

  if (!payload?.ok) return null
  return payload.result || null
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

    const logEvent = async (params: {
      eventType: string
      level?: 'info' | 'warning' | 'error'
      message: string
      context?: Record<string, unknown>
    }) => {
      await appendTelegramServerLog({
        event: params.eventType,
        level: params.level || 'info',
        message: params.message,
        context: {
          assistantId: id,
          orgId: assistant.org_id,
          ...params.context,
        },
      })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fire-and-forget: don't block the response for logging
    void logEvent({
      eventType: 'connect_request_started',
      message: 'Telegram one-click connect requested',
      context: { userId },
    })

    const botUsername = process.env.TELEGRAM_HOSTED_BOT_USERNAME
    const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
    const webhookSecret = process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET
    if (!botUsername) {
      await logEvent({
        eventType: 'connect_config_error',
        level: 'error',
        message: 'TELEGRAM_HOSTED_BOT_USERNAME missing',
      })
      return NextResponse.json(
        { error: 'TELEGRAM_HOSTED_BOT_USERNAME is not configured' },
        { status: 500 },
      )
    }

    if (!botToken || !webhookSecret) {
      await logEvent({
        eventType: 'connect_config_error',
        level: 'error',
        message: 'Hosted telegram bot token or webhook secret missing',
        context: {
          hasBotToken: !!botToken,
          hasWebhookSecret: !!webhookSecret,
        },
      })
      return NextResponse.json(
        {
          error:
            'TELEGRAM_HOSTED_BOT_TOKEN / TELEGRAM_HOSTED_WEBHOOK_SECRET is not configured',
        },
        { status: 500 },
      )
    }

    // ── Parallelize getMe + setWebhook + token creation ──
    // These are independent operations. Running them in parallel saves 2-4 seconds.
    const configuredWebhookBaseUrl =
      process.env.TELEGRAM_HOSTED_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      request.nextUrl.origin
    if (
      configuredWebhookBaseUrl.includes('localhost') ||
      configuredWebhookBaseUrl.includes('127.0.0.1')
    ) {
      void logEvent({
        eventType: 'telegram_webhook_invalid_url',
        level: 'error',
        message: 'Webhook base URL is local and not publicly reachable',
        context: { configuredWebhookBaseUrl },
      })

      return NextResponse.json(
        {
          error:
            'Telegram hosted connect needs a public webhook URL. Set TELEGRAM_HOSTED_WEBHOOK_BASE_URL to your public app URL (or tunnel URL).',
        },
        { status: 500 },
      )
    }

    const webhookUrl = `${configuredWebhookBaseUrl.replace(/\/$/, '')}/api/webhooks/telegram/hosted`

    // Fire all three in parallel: getMe validation, setWebhook, and token creation
    const [getMeResult, webhookResult, surfaceResult, tokenRecord] = await Promise.all([
      // 1. Validate bot identity
      fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      })
        .then(async (res) => {
          const payload = (await res.json().catch(() => null)) as TelegramGetMeResponse | null
          return { ok: res.ok, payload }
        })
        .catch(() => ({ ok: false, payload: null as TelegramGetMeResponse | null })),

      // 2. Set webhook
      fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
        }),
      })
        .then(async (res) => {
          const payload = (await res.json()) as { ok?: boolean; description?: string }
          return { ok: res.ok, payload }
        })
        .catch(() => ({ ok: false, payload: { ok: false, description: 'Network error' } })),

      // 3. Register the private-chat command menu. This is UX-only, so the
      // request is allowed to fail without blocking connect.
      syncHostedTelegramSurface(botToken, configuredWebhookBaseUrl).catch(() => ({
        commands: { ok: false, description: 'Network error' },
        shortDescription: { ok: false, description: 'Network error' },
        description: { ok: false, description: 'Network error' },
        menuButton: { ok: false, description: 'Network error', url: `${configuredWebhookBaseUrl.replace(/\/$/, '')}/telegram/mini-app` },
      })),

      // 4. Create connect token (DB only, no external dependency)
      createTelegramConnectToken({
        assistantId: id,
        orgId: assistant.org_id,
        createdBy: userId,
        ttlMinutes: 15,
      }),
    ])

    // Validate getMe result
    const actualBotUsername = getMeResult.payload?.result?.username
    if (!getMeResult.ok || !getMeResult.payload?.ok || !actualBotUsername) {
      void logEvent({
        eventType: 'telegram_get_me_failed',
        level: 'error',
        message: 'Telegram getMe failed during connect',
        context: {
          configuredBotUsername: botUsername,
          telegramDescription: getMeResult.payload?.description || 'getMe failed',
        },
      })

      ErrorService.captureException(new Error('Telegram getMe failed during hosted connect'), {
        severity: 'error',
        context: {
          endpoint: '/api/assistants/[id]/telegram-connect',
          method: 'POST',
          assistantId: id,
          configuredBotUsername: botUsername,
          telegramDescription: getMeResult.payload?.description || 'getMe failed',
        },
        tags: {
          layer: 'api',
          route: 'assistant-telegram-connect',
          integration: 'telegram-hosted',
        },
      })

      return NextResponse.json(
        {
          error: 'Failed to validate hosted Telegram bot token (getMe failed).',
        },
        { status: 500 },
      )
    }

    if (actualBotUsername.toLowerCase() !== botUsername.toLowerCase()) {
      void logEvent({
        eventType: 'telegram_bot_mismatch',
        level: 'error',
        message: 'Configured bot username does not match token identity',
        context: {
          configuredBotUsername: botUsername,
          actualBotUsername,
        },
      })

      ErrorService.captureException(
        new Error('TELEGRAM_HOSTED_BOT_USERNAME does not match TELEGRAM_HOSTED_BOT_TOKEN'),
        {
          severity: 'error',
          context: {
            endpoint: '/api/assistants/[id]/telegram-connect',
            method: 'POST',
            assistantId: id,
            configuredBotUsername: botUsername,
            actualBotUsername,
          },
          tags: {
            layer: 'api',
            route: 'assistant-telegram-connect',
            integration: 'telegram-hosted',
          },
        },
      )

      return NextResponse.json(
        {
          error: `Hosted bot configuration mismatch: TELEGRAM_HOSTED_BOT_USERNAME=${botUsername} but bot token resolves to @${actualBotUsername}`,
        },
        { status: 500 },
      )
    }

    // Validate setWebhook result
    if (!webhookResult.ok || !webhookResult.payload?.ok) {
      const webhookInfo = await getTelegramWebhookInfo(botToken)

      void logEvent({
        eventType: 'telegram_set_webhook_failed',
        level: 'error',
        message: 'Telegram setWebhook failed',
        context: {
          configuredWebhookBaseUrl,
          attemptedWebhookUrl: webhookUrl,
          telegramDescription: webhookResult.payload?.description || 'setWebhook failed',
          webhookInfo,
        },
      })

      ErrorService.captureException(
        new Error('Telegram setWebhook failed during hosted connect'),
        {
          severity: 'error',
          context: {
            endpoint: '/api/assistants/[id]/telegram-connect',
            method: 'POST',
            assistantId: id,
            configuredWebhookBaseUrl,
            attemptedWebhookUrl: webhookUrl,
            telegramDescription: webhookResult.payload?.description || 'setWebhook failed',
            webhookInfo,
          },
          tags: {
            layer: 'api',
            route: 'assistant-telegram-connect',
            integration: 'telegram-hosted',
          },
        },
      )

      return NextResponse.json(
        {
          error: `Failed to configure Telegram webhook: ${webhookResult.payload?.description || 'Unknown error'}`,
        },
        { status: 500 },
      )
    }

    if (!surfaceResult.commands.ok || !surfaceResult.shortDescription.ok || !surfaceResult.description.ok || !surfaceResult.menuButton.ok) {
      void logEvent({
        eventType: 'telegram_surface_sync_failed',
        level: 'warning',
        message: 'Telegram surface sync failed during connect',
        context: {
          commandsDescription: surfaceResult.commands.description || 'setMyCommands failed',
          shortDescription: surfaceResult.shortDescription.description || 'setMyShortDescription failed',
          description: surfaceResult.description.description || 'setMyDescription failed',
          menuButton: surfaceResult.menuButton.description || 'setChatMenuButton failed',
          menuButtonUrl: surfaceResult.menuButton.url,
        },
      })
    }

    const encodedToken = encodeURIComponent(tokenRecord.token)
    const connectUrl = `https://t.me/${botUsername}?start=${encodedToken}`
    const webConnectUrl = `https://web.telegram.org/k/#@${botUsername}?start=${encodedToken}`
    const manualStartCommand = `/start ${tokenRecord.token}`

    // Fire-and-forget: don't block response for success logging
    void logEvent({
      eventType: 'connect_link_generated',
      message: 'Telegram connect link generated successfully',
      context: {
        botUsername,
        webhookUrl,
        expiresAt: tokenRecord.expires_at,
      },
    })

    return NextResponse.json({
      connectUrl,
      webConnectUrl,
      webhookUrl,
      expiresAt: tokenRecord.expires_at,
      manualStartCommand,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[TG-CONNECT-API] ❌ UNHANDLED ERROR:', { message, stack })

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/telegram-connect', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-telegram-connect' },
    })
    return NextResponse.json(
      {
        error:
          message.includes('aborted') || message.includes('timeout')
            ? 'Timed out while configuring Telegram webhook. Verify TELEGRAM_HOSTED_WEBHOOK_BASE_URL is public and reachable.'
            : 'Failed to generate telegram connect URL',
      },
      { status: 500 },
    )
  }
}
