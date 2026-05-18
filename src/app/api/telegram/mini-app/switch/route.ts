import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  setPrimaryTelegramChannel,
  switchTelegramChatWorkspace,
} from '@/lib/db'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram/mini-app'

export const dynamic = 'force-dynamic'

const requestSchema = z.discriminatedUnion('target', [
  z.object({
    initData: z.string().min(1),
    target: z.literal('agent'),
    assistantId: z.string().uuid(),
  }),
  z.object({
    initData: z.string().min(1),
    target: z.literal('workspace'),
    orgId: z.string().uuid(),
  }),
])

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'Bot is unavailable.' }, { status: 503 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid Mini App switch payload.' }, { status: 400 })
  }

  const context = verifyTelegramMiniAppInitData(parsed.data.initData, botToken)
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Mini App session is invalid.' }, { status: 401 })
  }

  if (context.chatType !== 'private') {
    return NextResponse.json({ ok: false, error: 'Switching is only available in private chats.' }, { status: 400 })
  }

  if (parsed.data.target === 'agent') {
    const result = await setPrimaryTelegramChannel(context.chatId, parsed.data.assistantId)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: 'That agent is not available in this room.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  }

  const result = await switchTelegramChatWorkspace(context.chatId, parsed.data.orgId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'That workspace is not available in this room.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, assistantId: result.assistantId ?? null })
}
