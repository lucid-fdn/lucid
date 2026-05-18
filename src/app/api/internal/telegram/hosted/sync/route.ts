import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { ErrorService } from '@/lib/errors/error-service'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'
import { syncHostedTelegramSurface } from '@/lib/telegram/bot-commands'

export const dynamic = 'force-dynamic'

type TelegramWebhookResponse = {
  ok?: boolean
  description?: string
}

async function configureHostedTelegramWebhook(
  botToken: string,
  webhookBaseUrl: string,
  webhookSecret: string,
) {
  const webhookUrl = `${webhookBaseUrl.replace(/\/$/, '')}/api/webhooks/telegram/hosted`
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
    }),
  })

  const payload = (await res.json().catch(() => null)) as TelegramWebhookResponse | null

  return {
    ok: Boolean(res.ok && payload?.ok),
    webhookUrl,
    description: payload?.description,
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyInternalAuth(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error || 'Authentication failed' }, { status: 401 })
    }

    const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
    const webhookSecret = process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET
    const webhookBaseUrl =
      process.env.TELEGRAM_HOSTED_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL

    if (!botToken || !webhookSecret || !webhookBaseUrl) {
      return NextResponse.json(
        { error: 'Hosted Telegram bot is not fully configured' },
        { status: 500 },
      )
    }

    const [surface, webhook] = await Promise.all([
      syncHostedTelegramSurface(botToken, webhookBaseUrl),
      configureHostedTelegramWebhook(botToken, webhookBaseUrl, webhookSecret),
    ])

    if (!surface.commands.ok || !surface.shortDescription.ok || !surface.description.ok || !surface.menuButton.ok || !webhook.ok) {
      return NextResponse.json(
        {
          error: 'Hosted Telegram sync failed',
          surface,
          webhook,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      surface,
      webhook,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/telegram/hosted/sync', method: 'POST' },
      tags: { layer: 'api', route: 'internal-telegram-hosted-sync' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
