import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getTelegramVoiceSettingsForChat,
  updateTelegramVoiceSettingsForChat,
} from '@/lib/db'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram/mini-app'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  initData: z.string().min(1),
  mode: z.enum(['off', 'auto', 'always']).optional(),
  voiceId: z.string().max(100).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
})

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'Bot is unavailable.' }, { status: 503 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid Mini App settings payload.' }, { status: 400 })
  }

  const context = verifyTelegramMiniAppInitData(parsed.data.initData, botToken)
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Mini App session is invalid.' }, { status: 401 })
  }

  if (context.chatType !== 'private') {
    return NextResponse.json({ ok: false, error: 'Voice controls are only available in private chats.' }, { status: 400 })
  }

  const settings = await updateTelegramVoiceSettingsForChat({
    chatId: context.chatId,
    ...(parsed.data.mode ? { mode: parsed.data.mode } : {}),
    ...(parsed.data.voiceId !== undefined ? { voiceId: parsed.data.voiceId?.trim() || null } : {}),
    ...(parsed.data.instructions !== undefined ? { instructions: parsed.data.instructions?.trim() || null } : {}),
  })

  if (!settings) {
    return NextResponse.json({ ok: false, error: 'No active agent is available in this room.' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    settings: {
      mode: settings.mode,
      voiceId: settings.voiceId,
      instructions: settings.instructions,
    },
  })
}

export async function GET(request: NextRequest) {
  const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'Bot is unavailable.' }, { status: 503 })
  }

  const initData = request.nextUrl.searchParams.get('initData')?.trim()
  if (!initData) {
    return NextResponse.json({ ok: false, error: 'Missing Mini App session.' }, { status: 400 })
  }

  const context = verifyTelegramMiniAppInitData(initData, botToken)
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Mini App session is invalid.' }, { status: 401 })
  }

  const settings = await getTelegramVoiceSettingsForChat(context.chatId)
  return NextResponse.json({
    ok: true,
    settings: settings
      ? {
          mode: settings.mode,
          voiceId: settings.voiceId,
          instructions: settings.instructions,
        }
      : null,
  })
}
