import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import {
  handleAgentsCommand,
  handleHelpCommand,
  handleLeaveCommand,
  handleSwitchCommand,
  handleVoiceCommand,
  handleWhoamiCommand,
  handleWorkspaceCommand,
  TEXTS,
  type TelegramReply,
} from '@/lib/telegram/hosted-commands'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram/mini-app'

export const dynamic = 'force-dynamic'

const COMMAND_REGEX = /^\/(agents|switch|workspace|whoami|voice|leave|help)(?:@\w+)?(?:\s+(.+))?$/

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  reply: TelegramReply,
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply.text,
      ...(reply.parse_mode ? { parse_mode: reply.parse_mode } : {}),
      ...(reply.link_preview_options ? { link_preview_options: reply.link_preview_options } : {}),
      ...(reply.reply_markup ? { reply_markup: reply.reply_markup } : {}),
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description ?? `Telegram sendMessage failed (${response.status})`)
  }
}

async function dispatchCommand(cmd: string, chatId: string, arg: string): Promise<TelegramReply> {
  switch (cmd) {
    case 'agents':
      return handleAgentsCommand(chatId)
    case 'switch':
      return handleSwitchCommand(chatId, arg)
    case 'whoami':
      return handleWhoamiCommand(chatId)
    case 'workspace':
      return handleWorkspaceCommand(chatId, arg)
    case 'voice':
      return handleVoiceCommand(chatId)
    case 'leave':
      return handleLeaveCommand(chatId)
    case 'help':
      return handleHelpCommand()
    default:
      return handleHelpCommand()
  }
}

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'Bot is unavailable.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as
    | { command?: string; initData?: string }
    | null
  const command = body?.command?.trim()
  const initData = body?.initData?.trim()

  if (!command || !initData) {
    return NextResponse.json({ ok: false, error: 'Missing command payload.' }, { status: 400 })
  }

  const context = verifyTelegramMiniAppInitData(initData, botToken)
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Mini App session is invalid.' }, { status: 401 })
  }

  if (context.chatType !== 'private') {
    return NextResponse.json({ ok: false, error: TEXTS.groupChatNotSupported }, { status: 400 })
  }

  const match = command.match(COMMAND_REGEX)
  if (!match) {
    return NextResponse.json({ ok: false, error: 'That menu action is not supported.' }, { status: 400 })
  }

  try {
    const reply = await dispatchCommand(match[1], context.chatId, match[2] ?? '')
    await sendTelegramMessage(botToken, context.chatId, reply)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not deliver the Telegram action.',
      },
      { status: 502 },
    )
  }
}
