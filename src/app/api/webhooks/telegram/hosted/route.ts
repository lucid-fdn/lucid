import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  bindAgentToChatViaShare,
  consumeTelegramConnectToken,
  getTelegramChatScope,
  getAssistant,
  hasTelegramInboundForChatMessage,
  insertAssistantInboundEvent,
  listTelegramChannelsForChat,
  listTelegramWorkspacesForChat,
  peekTelegramConnectToken,
  persistTelegramChatScope,
  setPrimaryTelegramChannel,
  switchTelegramChatWorkspace,
  upsertHostedTelegramChannel,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getMediaProviderConfig } from '@/lib/ai/media-provider-config'
import { appendTelegramServerLog } from '@/lib/logging/telegram-server-log'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { buildTelegramPersona, personaFromBinding } from '@/lib/telegram/entity-presence'
import { escapeTelegramHtml, telegramBold } from '@/lib/telegram/format'
import {
  extractTelegramInboundContent,
  resolveTelegramIngress,
  type TelegramInboundAudio,
  type TelegramInboundDocument,
  type TelegramInboundPhotoSize,
  type TelegramInboundSticker,
  type TelegramInboundVoice,
} from '@/lib/telegram/inbound-media'
import { parseStartPayload, resolveActiveAgent } from '@/lib/telegram/hosted-router'
import {
  handleAgentsCommand,
  handleAgentOpsCommand,
  handleHelpCommand,
  handleLeaveCommand,
  handleSwitchCommand,
  handleVoiceCommand,
  handleVoiceModeUpdate,
  handleVoicePickUpdate,
  handleWorkspaceCommand,
  handleWhoamiCommand,
  TEXTS,
  type TelegramReply,
} from '@/lib/telegram/hosted-commands'
import {
  agentsKeyboard,
  onboardingKeyboard,
  parseCallbackData,
  replyControlsKeyboard,
  scopeSwitchKeyboard,
  type ChatBinding,
  workspaceKeyboard,
} from '@/lib/telegram/inline-keyboards'
import { chunkChannelText } from '@/lib/channels/channel-text-chunks'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'

interface TelegramHostedUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number }
    chat: { id: number; type: string }
    text?: string
    caption?: string
    photo?: TelegramInboundPhotoSize[]
    voice?: TelegramInboundVoice
    audio?: TelegramInboundAudio
    document?: TelegramInboundDocument
    sticker?: TelegramInboundSticker
    web_app_data?: {
      data?: string
    }
    date: number
  }
  callback_query?: {
    id: string
    from: { id: number }
    message?: {
      message_id: number
      chat: { id: number; type: string }
    }
    data?: string
  }
}

const COMMAND_REGEX = /^\/(agents|switch|workspace|whoami|voice|ops|agentops|check|buy|research|plan|search|remember|claims|extract|monitor|whales|token|markets|portfolio|copy|web3|leave|help)(?:@\w+)?(?:\s+(.+))?$/

function parseTelegramMiniAppCommand(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { action?: string; command?: string }
    if (parsed.action === 'command' && typeof parsed.command === 'string') {
      return parsed.command.trim()
    }
  } catch {
    if (raw.trim().startsWith('/')) return raw.trim()
  }
  return null
}

/**
 * Timing-safe comparison of the Telegram webhook secret header against the
 * configured secret. Rejects on length mismatch up front (Buffer length guard)
 * before calling timingSafeEqual, which throws on unequal-length inputs.
 *
 * Mirrors openclaw-core commit 7e49e98f79 (GHSA-jq3f-vjww-8rq7) — validates
 * the secret BEFORE the request body is read, and uses constant-time compare
 * so an attacker cannot learn the secret via response-timing side channels.
 */
function secretsMatch(incoming: string, expected: string): boolean {
  const a = Buffer.from(incoming, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  reply: TelegramReply,
): Promise<void> {
  const chunks = reply.parse_mode ? [reply.text] : chunkChannelText(reply.text, 'telegram')

  for (const [index, text] of chunks.entries()) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(reply.parse_mode ? { parse_mode: reply.parse_mode } : {}),
        ...(reply.link_preview_options ? { link_preview_options: reply.link_preview_options } : {}),
        ...(index === 0 && reply.reply_markup ? { reply_markup: reply.reply_markup } : {}),
      }),
    })

    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null

    if (!res.ok || payload?.ok === false) {
      throw new Error(payload?.description ?? `Telegram sendMessage failed (${res.status})`)
    }
  }
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  })
}

async function editTelegramKeyboard(
  botToken: string,
  chatId: string,
  messageId: number,
  reply: TelegramReply,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: reply.text,
        ...(reply.parse_mode ? { parse_mode: reply.parse_mode } : {}),
        ...(reply.link_preview_options ? { link_preview_options: reply.link_preview_options } : {}),
        ...(reply.reply_markup ? { reply_markup: reply.reply_markup } : {}),
      }),
    })
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null
    if (!res.ok || payload?.ok === false) {
      console.warn('[TG-HOSTED-WH] editMessageText failed', {
        chatId: maskIdentifier(chatId),
        messageId,
        description: payload?.description ?? `HTTP ${res.status}`,
      })
      return false
    }
    return true
  } catch (error) {
    console.warn('[TG-HOSTED-WH] editMessageText threw', {
      chatId: maskIdentifier(chatId),
      messageId,
      error: summarizeError(error),
    })
    return false
  }
}

function buildOnboardingReply(input: {
  name: string
  description?: string | null
  telegram_display_name?: string | null
  telegram_role_title?: string | null
  telegram_essence?: string | null
  telegram_starter_prompts?: string[] | null
}): TelegramReply {
  const persona = buildTelegramPersona({
    name: input.name,
    description: input.description,
    overrides: {
      displayName: input.telegram_display_name,
      roleTitle: input.telegram_role_title,
      essence: input.telegram_essence,
      starterPrompts: input.telegram_starter_prompts ?? null,
    },
  })
  return {
    text:
      `${telegramBold(`You've entered ${persona.displayName}'s room.`)}\n` +
      `${escapeTelegramHtml(persona.roleTitle)}\n` +
      `${escapeTelegramHtml(persona.essence)}\n\n` +
      'Say anything to begin, or meet the others.',
    reply_markup: onboardingKeyboard(),
    parse_mode: 'HTML',
  }
}

function buildNoPrimaryReply(bindings: ChatBinding[]): TelegramReply {
  return {
    text: 'No one is active right now.\nChoose who should step in.',
    reply_markup: agentsKeyboard(bindings),
    parse_mode: 'HTML',
  }
}

function buildAgentsPanelReply(bindings: ChatBinding[]): TelegramReply {
  const active = bindings.find((binding) => binding.is_primary)
  if (!active) return buildNoPrimaryReply(bindings)
  const persona = personaFromBinding(active)
  return {
    text:
      `${telegramBold('Agents in this chat')}\n\n` +
      `${telegramBold('Active now')}: ${escapeTelegramHtml(persona.displayName)}\n` +
      `${escapeTelegramHtml(persona.roleTitle)}\n` +
      `${escapeTelegramHtml(persona.essence)}`,
    reply_markup: agentsKeyboard(bindings),
    parse_mode: 'HTML',
  }
}

function buildHelpPanelReply(): TelegramReply {
  return {
    text:
      'Talk normally. The active Lucid entity will answer.\n\n' +
      '/agents — meet the agents bound to this chat\n' +
      '/switch <name> — bring a different agent forward\n' +
      '/workspace — switch workspace for this chat\n' +
      '/whoami — see who is speaking\n' +
      '/leave — let the current agent step out',
    reply_markup: replyControlsKeyboard(),
  }
}

function buildVoiceMiniAppReply(appBaseUrl: string): TelegramReply {
  const url = `${appBaseUrl.replace(/\/$/, '')}/telegram/mini-app`
  return {
    text:
      `${telegramBold('Advanced voice settings')}\n\n` +
      'Open the Lucid mini app to tune room voice mode, pick a voice, and refine speaking style.',
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Open Voice Settings', url, style: 'primary' },
      ]],
    },
  }
}

function buildScopeSwitchReply(input: {
  currentScopeName: string
  targetScopeName: string
  targetAssistantName: string
  assistantId?: string
  connectToken?: string
}): TelegramReply {
  return {
    text:
      `${telegramBold('Current workspace')}: ${escapeTelegramHtml(input.currentScopeName)}\n\n` +
      `${telegramBold(input.targetAssistantName)} belongs to ${escapeTelegramHtml(input.targetScopeName)}.\n` +
      'Switching here will hide the current workspace agents in this chat, but it will not delete them.',
    reply_markup: scopeSwitchKeyboard({
      assistantId: input.assistantId,
      connectToken: input.connectToken,
    }),
    parse_mode: 'HTML',
  }
}

function buildWorkspaceSwitchedReply(input: {
  workspaces: Array<{ org_id: string; org_name: string; agent_count: number; is_current: boolean }>
  assistantName?: string | null
}): TelegramReply {
  const current = input.workspaces.find((workspace) => workspace.is_current) ?? input.workspaces[0]
  return {
    text: current
      ? (
        `${telegramBold('Current workspace')}: ${escapeTelegramHtml(current.org_name)}\n` +
        (input.assistantName
          ? `${telegramBold('Active now')}: ${escapeTelegramHtml(input.assistantName)}\n`
          : 'Workspace switched.\n') +
        'Choose a workspace for this Telegram chat.'
      )
      : (input.assistantName
        ? `${telegramBold('Active now')}: ${escapeTelegramHtml(input.assistantName)}`
        : 'Workspace switched.'),
    reply_markup: workspaceKeyboard(input.workspaces),
    parse_mode: 'HTML',
  }
}

function triggerWorker(
  reqId?: string,
  payload?: {
    eventId?: string | null
    assistantId?: string | null
  },
): void {
  const workerUrl = process.env.WORKER_URL
  const workerSecret = process.env.WORKER_TRIGGER_SECRET
  const tag = reqId ? `[TG-HOSTED-WH][${reqId}]` : '[TG-HOSTED-WH]'

  if (!workerUrl) {
    console.error(`${tag} ❌ WORKER_URL is not set - cannot trigger worker!`)
    return
  }

  fetch(`${workerUrl}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workerSecret && { Authorization: `Bearer ${workerSecret}` }),
    },
    body: JSON.stringify({
      event_type: 'inbound',
      ...(payload?.eventId ? { event_id: payload.eventId } : {}),
      ...(payload?.assistantId ? { assistant_id: payload.assistantId } : {}),
    }),
  }).catch((error) => {
    console.error(`${tag} ❌ Worker trigger FAILED:`, error instanceof Error ? error.message : error)
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { endpoint: '/api/webhooks/telegram/hosted', operation: 'triggerWorker', workerUrl, reqId },
      tags: { layer: 'api', route: 'telegram-hosted-webhook' },
    })
  })
}

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8)

  try {
    const botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
    const webhookSecret = process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET

    if (!botToken || !webhookSecret) {
      console.error(`[TG-HOSTED-WH][${reqId}] ❌ MISSING ENV VARS`)
      return NextResponse.json({ ok: true })
    }

    const incomingSecret = request.headers.get('x-telegram-bot-api-secret-token')
    if (!incomingSecret || !secretsMatch(incomingSecret, webhookSecret)) {
      console.warn(`[TG-HOSTED-WH][${reqId}] Invalid request signature - rejecting silently`)
      return NextResponse.json({ ok: true })
    }

    const body = (await request.json()) as TelegramHostedUpdate

    // ----- Branch 1: callback_query (inline keyboard tap) -----
    if (body.callback_query) {
      await handleCallbackQuery(body.callback_query, botToken, reqId)
      return NextResponse.json({ ok: true })
    }

    const message = body.message
    if (!message) {
      return NextResponse.json({ ok: true })
    }
    const inbound = extractTelegramInboundContent(message)
    const mediaProviderConfig = getMediaProviderConfig()
    const ingress = await resolveTelegramIngress({
      messageText: inbound.messageText,
      attachments: inbound.attachments,
      botToken,
      llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
      llmApiKey: mediaProviderConfig.preferredGatewayApiKey,
      llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
      llmApiKeys: mediaProviderConfig.gatewayApiKeys,
    })
    const effectiveMessageText = ingress.messageText
    if (!effectiveMessageText && inbound.attachments.length === 0 && !message.web_app_data?.data) {
      return NextResponse.json({ ok: true })
    }

    const chatId = String(message.chat.id)
    const userId = String(message.from.id)
    const isPrivateChat = message.chat.type === 'private'

    // ----- Branch 2: Telegram Mini App actions -----
    const miniAppCommand = parseTelegramMiniAppCommand(message.web_app_data?.data)
    if (miniAppCommand) {
      if (!isPrivateChat) {
        await sendTelegramMessage(botToken, chatId, { text: TEXTS.groupChatNotSupported, parse_mode: 'HTML' })
        return NextResponse.json({ ok: true })
      }
      const commandMatch = miniAppCommand.match(COMMAND_REGEX)
      if (!commandMatch) {
        await sendTelegramMessage(botToken, chatId, {
          text: 'That Mini App action is not supported yet.',
          parse_mode: 'HTML',
        })
        return NextResponse.json({ ok: true })
      }
      const cmd = commandMatch[1]
      const arg = commandMatch[2] ?? ''
      const reply = await dispatchCommand(cmd, chatId, arg)
      await sendTelegramMessage(botToken, chatId, reply)
      return NextResponse.json({ ok: true })
    }

    // ----- Branch 3: /start with or without payload -----
    const startPayload = effectiveMessageText ? parseStartPayload(effectiveMessageText) : null
    if (startPayload) {
      // Per spec §2.4 (Group chats): multi-agent deep links bind DMs only —
      // any participant could later /switch or /leave a group's active agent.
      // Block `/start agent_<uuid>` in groups, but allow `/start` (no payload)
      // and opaque connect tokens to fall back to legacy single-agent
      // behavior with a warning log.
      if (!isPrivateChat && startPayload.kind === 'agent_share') {
        await appendTelegramServerLog({
          event: 'group_deep_link_blocked',
          message: 'Deep link bind blocked in group chat (DM only)',
          context: { chatId, userId, assistantId: startPayload.assistantId },
        })
        await sendTelegramMessage(botToken, chatId, { text: TEXTS.groupChatNotSupported, parse_mode: 'HTML' })
        return NextResponse.json({ ok: true })
      }
      if (!isPrivateChat && startPayload.kind === 'none') {
        // Spec §2.4: fall back to existing single-agent behavior + log warning.
        // We drop the `/start` (no reply) so legacy group bindings keep working
        // without exposing multi-agent commands or onboarding chrome.
        await appendTelegramServerLog({
          event: 'group_start_dropped',
          message: 'Group /start (no payload) dropped — multi-agent commands DM-only',
          context: { chatId, userId },
        })
        return NextResponse.json({ ok: true })
      }
      await handleStart({
        startPayload,
        chatId,
        userId,
        botToken,
        webhookSecret,
        updateId: body.update_id,
      })
      return NextResponse.json({ ok: true })
    }

    // ----- Branch 4: in-chat commands -----
    const commandMatch = effectiveMessageText?.match(COMMAND_REGEX)
    if (commandMatch) {
      // Multi-agent commands are DM-only. /help is also blocked in groups —
      // its body advertises /agents /switch /whoami /leave which all reply
      // "groupChatNotSupported" when tried, creating a misleading UX.
      if (!isPrivateChat) {
        await sendTelegramMessage(botToken, chatId, { text: TEXTS.groupChatNotSupported, parse_mode: 'HTML' })
        return NextResponse.json({ ok: true })
      }
      const cmd = commandMatch[1]
      const arg = commandMatch[2] ?? ''
      const reply = await dispatchCommand(cmd, chatId, arg)
      await sendTelegramMessage(botToken, chatId, reply)
      return NextResponse.json({ ok: true })
    }

    // ----- Branch 5: plain message → route via primary -----
    const resolution = await resolveActiveAgent(chatId)

    if (resolution.kind === 'no_bindings') {
      await appendTelegramServerLog({
        event: 'routing_dropped',
        message: 'Inbound message dropped: chat has no bindings',
        context: { chatId, userId, reason: 'no_bindings' },
      })
      await sendTelegramMessage(botToken, chatId, {
        text: TEXTS.onboarding,
        reply_markup: onboardingKeyboard(),
        parse_mode: 'HTML',
      })
      return NextResponse.json({ ok: true })
    }

    if (resolution.kind === 'has_bindings_no_primary') {
      await appendTelegramServerLog({
        event: 'routing_no_primary',
        message: 'Inbound message dropped: chat has bindings but no primary',
        context: { chatId, userId, bindingCount: resolution.bindings.length },
      })
      await sendTelegramMessage(botToken, chatId, buildNoPrimaryReply(resolution.bindings))
      return NextResponse.json({ ok: true })
    }

    const hostedChannel = resolution.channel

    // Replay dedupe: if a previous Telegram retry already stored this update
    // under a DIFFERENT channel_id (because the chat's primary swapped between
    // deliveries), treat it as a duplicate. The default upsert dedupe key is
    // (channel_id, external_message_id) which would otherwise let the same
    // update be processed by two agents.
    const isReplay = await hasTelegramInboundForChatMessage(
      chatId,
      String(message.message_id),
    )
    if (isReplay) {
      await appendTelegramServerLog({
        event: 'replay_dropped',
        message: 'Inbound message dropped: replay across primary swap',
        context: {
          chatId,
          userId,
          messageId: message.message_id,
          updateId: body.update_id,
          assistantId: hostedChannel.assistant_id,
        },
      })
      return NextResponse.json({ ok: true })
    }

    await appendTelegramServerLog({
      event: 'message_received',
      message: 'Inbound Telegram message received for connected channel',
      context: {
        assistantId: hostedChannel.assistant_id,
        updateId: body.update_id,
        chatId,
        userId,
        messageId: message.message_id,
        hasText: !!effectiveMessageText,
        attachmentCount: inbound.attachments.length,
        textPreview: effectiveMessageText?.slice(0, 120),
      },
    })

    const insertedEvent = await insertAssistantInboundEvent({
      channel_id: hostedChannel.id,
      assistant_id: hostedChannel.assistant_id,
      external_message_id: String(message.message_id),
      external_user_id: userId,
      external_chat_id: chatId,
      message_text: effectiveMessageText,
      message_data: {
        from: message.from,
        chat: message.chat,
        telegram_chat_id: chatId,
        date: message.date,
        telegram_ingress_preprocessed: true,
        telegram_voice_input: inbound.attachments.some((attachment) => attachment.kind === 'voice'),
        ...(inbound.attachments.length > 0 ? { attachments: inbound.attachments } : {}),
      },
    })

    await appendTelegramServerLog({
      event: 'event_queued',
      message: 'Inbound Telegram event stored and worker trigger requested',
      context: {
        assistantId: hostedChannel.assistant_id,
        channelId: hostedChannel.id,
        externalMessageId: String(message.message_id),
      },
    })

    triggerWorker(reqId, {
      eventId: insertedEvent?.id ?? null,
      assistantId: insertedEvent?.assistant_id ?? hostedChannel.assistant_id,
    })
    void publishWakeForChannel(hostedChannel.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : undefined
    console.error(`[TG-HOSTED-WH][${reqId}] ❌ UNHANDLED ERROR:`, { message, stack })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/telegram/hosted', method: 'POST', reqId },
      tags: { layer: 'api', route: 'telegram-hosted-webhook' },
    })
    return NextResponse.json({ ok: true })
  }
}

// ---------------------------------------------------------------------------
// Branch handlers
// ---------------------------------------------------------------------------

async function handleStart(params: {
  startPayload: ReturnType<typeof parseStartPayload>
  chatId: string
  userId: string
  botToken: string
  webhookSecret: string
  updateId: number
}): Promise<void> {
  const { startPayload, chatId, userId, botToken, webhookSecret, updateId } = params
  if (!startPayload) return

  // /start with no payload — show /agents or onboarding
  if (startPayload.kind === 'none') {
    const reply = await handleAgentsCommand(chatId)
    await sendTelegramMessage(botToken, chatId, reply)
    return
  }

  // /start agent_<uuid> — public deep link
  if (startPayload.kind === 'agent_share') {
    const [targetAssistant, activeScope] = await Promise.all([
      getAssistant(startPayload.assistantId),
      getTelegramChatScope(chatId),
    ])

    if (
      activeScope?.orgId &&
      targetAssistant?.org_id &&
      activeScope.orgId !== targetAssistant.org_id
    ) {
      await sendTelegramMessage(
        botToken,
        chatId,
        buildScopeSwitchReply({
          currentScopeName: 'your current workspace',
          targetScopeName: 'another workspace',
          targetAssistantName: targetAssistant.telegram_display_name ?? targetAssistant.name,
          assistantId: startPayload.assistantId,
        }),
      )
      return
    }

    const result = await bindAgentToChatViaShare({
      assistantId: startPayload.assistantId,
      chatId,
      botToken,
      webhookSecret,
    })

    if (!result.ok) {
      if (result.error === 'share_disabled') {
        await appendTelegramServerLog({
          event: 'share_disabled_blocked',
          message: 'Deep link bind blocked: telegram_share_enabled is false',
          context: { assistantId: startPayload.assistantId, chatId, userId },
        })
        await sendTelegramMessage(botToken, chatId, { text: TEXTS.shareDisabled, parse_mode: 'HTML' })
        return
      }
      if (result.error === 'bind_failed') {
        await appendTelegramServerLog({
          event: 'bind_failed',
          message: 'Deep link bind failed (race or DB error during primary swap)',
          context: { assistantId: startPayload.assistantId, chatId, userId },
        })
        await sendTelegramMessage(botToken, chatId, { text: TEXTS.bindFailed, parse_mode: 'HTML' })
        return
      }
      await sendTelegramMessage(botToken, chatId, { text: TEXTS.agentNotFound, parse_mode: 'HTML' })
      return
    }

    if (targetAssistant?.org_id) {
      await persistTelegramChatScope(chatId, targetAssistant.org_id)
    }

    const agent = await getAssistant(result.assistantId)
    const name = agent?.name ?? 'this agent'

    await appendTelegramServerLog({
      event: 'chat_bound_via_deep_link',
      message: 'Telegram chat bound to assistant via public deep link',
      context: { assistantId: result.assistantId, chatId, userId, channelId: result.channelId },
    })

    await sendTelegramMessage(
      botToken,
      chatId,
      buildOnboardingReply({
        name,
        description: agent?.description ?? null,
        telegram_display_name: agent?.telegram_display_name ?? null,
        telegram_role_title: agent?.telegram_role_title ?? null,
        telegram_essence: agent?.telegram_essence ?? null,
        telegram_starter_prompts: agent?.telegram_starter_prompts ?? null,
      }),
    )
    return
  }

  // /start <opaque-token> — first-party connect (existing flow)
  const tokenPreview = await peekTelegramConnectToken({
    token: startPayload.token,
  })

  if (!tokenPreview) {
    const looksLikeShare = startPayload.token.startsWith('agent_')
    await sendTelegramMessage(botToken, chatId, {
      text: looksLikeShare
        ? TEXTS.agentNotFound
        : '❌ This connect link is invalid or expired. Please generate a new one from LucidMerged.',
    })
    return
  }

  const [activeScope, tokenAssistant] = await Promise.all([
    getTelegramChatScope(chatId),
    getAssistant(tokenPreview.assistantId),
  ])

  if (
    activeScope?.orgId &&
    tokenPreview.orgId &&
    activeScope.orgId !== tokenPreview.orgId
  ) {
    await sendTelegramMessage(
      botToken,
      chatId,
      buildScopeSwitchReply({
        currentScopeName: 'your current workspace',
        targetScopeName: 'another workspace',
        targetAssistantName:
          tokenAssistant?.telegram_display_name ?? tokenAssistant?.name ?? 'this agent',
        connectToken: startPayload.token,
      }),
    )
    return
  }

  const tokenPayload = await consumeTelegramConnectToken({
    token: startPayload.token,
    telegramUserId: userId,
    telegramChatId: chatId,
  })

  if (!tokenPayload) {
    const looksLikeShare = startPayload.token.startsWith('agent_')
    await sendTelegramMessage(botToken, chatId, {
      text: looksLikeShare
        ? TEXTS.agentNotFound
        : '❌ This connect link is invalid or expired. Please generate a new one from LucidMerged.',
    })
    return
  }

  await appendTelegramServerLog({
    event: 'webhook_start_received',
    message: 'Telegram /start received for hosted connect',
    context: {
      assistantId: tokenPayload.assistantId,
      orgId: tokenPayload.orgId,
      updateId,
      chatId,
      userId,
      hasToken: true,
    },
  })

  try {
    await upsertHostedTelegramChannel({
      assistantId: tokenPayload.assistantId,
      telegramChatId: chatId,
      webhookSecret,
      botToken,
    })
  } catch (error) {
    // upsertHostedTelegramChannel throws if the primary-swap RPC fails (race
    // against a concurrent /start for a different agent on the same chat).
    // The outer webhook catch would swallow this into `{ ok: true }` with no
    // user-visible reply, leaving the connect token consumed but the user
    // staring at silence. Surface an explicit failure here instead.
    await appendTelegramServerLog({
      event: 'bind_failed',
      message: 'First-party /start bind failed after token consumption',
      context: {
        assistantId: tokenPayload.assistantId,
        orgId: tokenPayload.orgId,
        chatId,
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      },
    })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/webhooks/telegram/hosted',
        operation: 'handleStart.upsertHostedTelegramChannel',
        assistantId: tokenPayload.assistantId,
        chatId,
      },
      tags: { layer: 'api', route: 'telegram-hosted-webhook' },
    })
    await sendTelegramMessage(botToken, chatId, { text: TEXTS.bindFailed, parse_mode: 'HTML' })
    return
  }

  await persistTelegramChatScope(chatId, tokenPayload.orgId)

  await appendTelegramServerLog({
    event: 'channel_linked',
    message: 'Telegram chat linked to assistant successfully',
    context: { assistantId: tokenPayload.assistantId, orgId: tokenPayload.orgId, chatId, userId },
  })

  const assistant = await getAssistant(tokenPayload.assistantId)
  await sendTelegramMessage(
    botToken,
    chatId,
    buildOnboardingReply({
      name: assistant?.name ?? 'This agent',
      description: assistant?.description ?? null,
      telegram_display_name: assistant?.telegram_display_name ?? null,
      telegram_role_title: assistant?.telegram_role_title ?? null,
      telegram_essence: assistant?.telegram_essence ?? null,
      telegram_starter_prompts: assistant?.telegram_starter_prompts ?? null,
    }),
  )
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
    case 'ops':
    case 'agentops':
      return handleAgentOpsCommand(chatId, arg)
    case 'check':
    case 'buy':
    case 'research':
    case 'plan':
    case 'search':
    case 'remember':
    case 'claims':
    case 'extract':
    case 'monitor':
    case 'whales':
    case 'token':
    case 'markets':
    case 'portfolio':
    case 'copy':
    case 'web3':
      return handleAgentOpsCommand(chatId, `${cmd} ${arg}`.trim())
    case 'leave':
      return handleLeaveCommand(chatId)
    case 'help':
      return handleHelpCommand()
    default:
      return handleHelpCommand()
  }
}

async function handleCallbackQuery(
  cb: NonNullable<TelegramHostedUpdate['callback_query']>,
  botToken: string,
  reqId: string,
): Promise<void> {
  if (!cb.data || !cb.message) {
    await answerCallbackQuery(botToken, cb.id)
    return
  }

  // Multi-agent inline keyboards are only meaningful in DMs.
  if (cb.message.chat.type !== 'private') {
    await answerCallbackQuery(botToken, cb.id, 'Only available in private chats.')
    return
  }

  const parsed = parseCallbackData(cb.data)
  if (!parsed) {
    console.warn(`[TG-HOSTED-WH][${reqId}] Unknown callback action`, {
      callbackHash: maskIdentifier(cb.data),
    })
    await answerCallbackQuery(botToken, cb.id)
    return
  }

  const chatId = String(cb.message.chat.id)

  if (parsed.kind === 'panel') {
    const bindings = await listTelegramChannelsForChat(chatId)
    if (bindings.length === 0) {
      await answerCallbackQuery(botToken, cb.id, 'No agents are bound here yet.')
      await sendTelegramMessage(botToken, chatId, {
        text: TEXTS.onboarding,
        reply_markup: onboardingKeyboard(),
        parse_mode: 'HTML',
      })
      return
    }

    if (parsed.panel === 'start') {
      const active = bindings.find((binding) => binding.is_primary) ?? bindings[0]
      const persona = personaFromBinding(active)
      await answerCallbackQuery(botToken, cb.id, `${persona.displayName} is listening.`)
      await sendTelegramMessage(botToken, chatId, {
        text:
          `${telegramBold('Active now')}: ${escapeTelegramHtml(persona.displayName)}\n` +
          'Send your next message.',
        reply_markup: replyControlsKeyboard(),
        parse_mode: 'HTML',
      })
      return
    }

    if (parsed.panel === 'help') {
      await answerCallbackQuery(botToken, cb.id)
      await sendTelegramMessage(botToken, chatId, buildHelpPanelReply())
      return
    }

    await answerCallbackQuery(botToken, cb.id)
    await sendTelegramMessage(
      botToken,
      chatId,
      parsed.panel === 'agents' ? buildAgentsPanelReply(bindings) : buildNoPrimaryReply(bindings),
    )
    return
  }

  if (parsed.kind === 'scope') {
    const webhookSecret = process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET
    if (!webhookSecret) {
      await answerCallbackQuery(botToken, cb.id, 'Telegram configuration is unavailable.')
      return
    }

    if (parsed.mode === 'cancel') {
      await answerCallbackQuery(botToken, cb.id, 'Kept current workspace.')
      return
    }

    if (parsed.mode === 'assistant') {
      const assistant = await getAssistant(parsed.assistantId)
      if (!assistant) {
        await answerCallbackQuery(botToken, cb.id, 'That agent is no longer available.')
        return
      }

      const result = await bindAgentToChatViaShare({
        assistantId: parsed.assistantId,
        chatId,
        botToken,
        webhookSecret,
      })

      if (!result.ok) {
        await answerCallbackQuery(botToken, cb.id, 'Could not switch workspace.')
        return
      }

      if (assistant?.org_id) {
        await persistTelegramChatScope(chatId, assistant.org_id)
      }

      const workspaces = await listTelegramWorkspacesForChat(chatId)
      const workspaceReply = buildWorkspaceSwitchedReply({
        workspaces,
        assistantName: assistant.telegram_display_name ?? assistant.name,
      })
      const edited = cb.message
        ? await editTelegramKeyboard(
          botToken,
          chatId,
          cb.message.message_id,
          workspaceReply,
        )
        : false
      if (!edited) {
        await sendTelegramMessage(botToken, chatId, workspaceReply)
      }

      await answerCallbackQuery(
        botToken,
        cb.id,
        `${assistant.telegram_display_name ?? assistant.name} stepped in.`,
      )
      await sendTelegramMessage(
        botToken,
        chatId,
        buildOnboardingReply({
          name: assistant.name,
          description: assistant.description ?? null,
          telegram_display_name: assistant.telegram_display_name ?? null,
          telegram_role_title: assistant.telegram_role_title ?? null,
          telegram_essence: assistant.telegram_essence ?? null,
          telegram_starter_prompts: assistant.telegram_starter_prompts ?? null,
        }),
      )
      return
    }

    const tokenPayload = await consumeTelegramConnectToken({
      token: parsed.token,
      telegramUserId: String(cb.from.id),
      telegramChatId: chatId,
    })

    if (!tokenPayload) {
      await answerCallbackQuery(botToken, cb.id, 'That link is invalid or expired.')
      return
    }

    try {
      await upsertHostedTelegramChannel({
        assistantId: tokenPayload.assistantId,
        telegramChatId: chatId,
        webhookSecret,
        botToken,
      })
    } catch {
      await answerCallbackQuery(botToken, cb.id, 'Could not switch workspace.')
      return
    }

    await persistTelegramChatScope(chatId, tokenPayload.orgId)

    const assistant = await getAssistant(tokenPayload.assistantId)
    const workspaces = await listTelegramWorkspacesForChat(chatId)
    const workspaceReply = buildWorkspaceSwitchedReply({
      workspaces,
      assistantName: assistant?.telegram_display_name ?? assistant?.name ?? 'This agent',
    })
    const edited = cb.message
      ? await editTelegramKeyboard(
        botToken,
        chatId,
        cb.message.message_id,
        workspaceReply,
      )
      : false
    if (!edited) {
      await sendTelegramMessage(botToken, chatId, workspaceReply)
    }
    await answerCallbackQuery(
      botToken,
      cb.id,
      `${assistant?.telegram_display_name ?? assistant?.name ?? 'This agent'} stepped in.`,
    )
    await sendTelegramMessage(
      botToken,
      chatId,
      buildOnboardingReply({
        name: assistant?.name ?? 'This agent',
        description: assistant?.description ?? null,
        telegram_display_name: assistant?.telegram_display_name ?? null,
        telegram_role_title: assistant?.telegram_role_title ?? null,
        telegram_essence: assistant?.telegram_essence ?? null,
        telegram_starter_prompts: assistant?.telegram_starter_prompts ?? null,
      }),
    )
    return
  }

  if (parsed.kind === 'workspace') {
    const result = await switchTelegramChatWorkspace(chatId, parsed.orgId)
    if (!result.ok) {
      await answerCallbackQuery(botToken, cb.id, 'Could not switch workspace.')
      return
    }

    const workspaces = await listTelegramWorkspacesForChat(chatId)
    const assistant = result.assistantId ? await getAssistant(result.assistantId) : null
    const reply = buildWorkspaceSwitchedReply({
      workspaces,
      assistantName: assistant ? (assistant.telegram_display_name ?? assistant.name) : null,
    })
    const edited = await editTelegramKeyboard(botToken, chatId, cb.message.message_id, reply)
    if (!edited) {
      await sendTelegramMessage(botToken, chatId, reply)
    }
    await answerCallbackQuery(botToken, cb.id, 'Workspace switched.')
    await sendTelegramMessage(botToken, chatId, {
      text: assistant
        ? `${telegramBold('Active now')}: ${escapeTelegramHtml(assistant.telegram_display_name ?? assistant.name)}`
        : 'Workspace switched.',
      reply_markup: replyControlsKeyboard(),
      parse_mode: 'HTML',
    })
    return
  }

  if (parsed.kind === 'voice') {
    if (parsed.action === 'miniapp') {
      const appBaseUrl =
        process.env.TELEGRAM_HOSTED_WEBHOOK_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim()
      await answerCallbackQuery(botToken, cb.id, appBaseUrl ? 'Opening advanced voice settings.' : 'Mini app link is unavailable right now.')
      if (appBaseUrl) {
        await sendTelegramMessage(botToken, chatId, buildVoiceMiniAppReply(appBaseUrl))
      }
      return
    }

    const reply = parsed.action === 'mode'
      ? await handleVoiceModeUpdate(chatId, parsed.mode)
      : await handleVoicePickUpdate(chatId, parsed.voiceId)

    if (!reply) {
      await answerCallbackQuery(botToken, cb.id, 'No active agent is available in this room.')
      return
    }

    const edited = await editTelegramKeyboard(botToken, chatId, cb.message.message_id, reply)
    if (!edited) {
      await sendTelegramMessage(botToken, chatId, reply)
    }
    await answerCallbackQuery(botToken, cb.id, parsed.action === 'mode' ? 'Voice reply mode updated.' : 'Voice updated.')
    return
  }

  if (parsed.kind === 'page') {
    // Pagination: re-render the same message with a different page slice.
    const bindings = await listTelegramChannelsForChat(chatId)
    const reply = {
      ...buildAgentsPanelReply(bindings),
      reply_markup: agentsKeyboard(bindings, { page: parsed.page }),
    }
    const edited = await editTelegramKeyboard(botToken, chatId, cb.message.message_id, reply)
    if (!edited) {
      await sendTelegramMessage(botToken, chatId, reply)
    }
    await answerCallbackQuery(botToken, cb.id)
    return
  }

  const scope = await getTelegramChatScope(chatId)
  const bindings = await listTelegramChannelsForChat(chatId)
  if (
    scope &&
    bindings.length > 0 &&
    !bindings.some((binding) => binding.assistant_id === parsed.assistantId)
  ) {
    await answerCallbackQuery(botToken, cb.id, 'That agent belongs to a different workspace.')
    return
  }

  const result = await setPrimaryTelegramChannel(chatId, parsed.assistantId)

  if (!result.ok) {
    await answerCallbackQuery(botToken, cb.id, 'Could not switch — agent no longer bound.')
    return
  }

  await appendTelegramServerLog({
    event: 'chat_switched',
    message: 'Telegram chat primary swapped via inline keyboard',
    context: { chatId, assistantId: parsed.assistantId, source: 'callback_query' },
  })

  // Refresh the keyboard so the ✅ moves to the new active agent
  const refreshedBindings = await listTelegramChannelsForChat(chatId)
  const active = refreshedBindings.find((b) => b.assistant_id === parsed.assistantId)
  if (active?.org_id) {
    await persistTelegramChatScope(chatId, active.org_id)
  }
  const persona = active ? personaFromBinding(active) : null
  const reply = {
    text: persona
      ? (
        `${telegramBold('Active now')}: ${escapeTelegramHtml(persona.displayName)}\n` +
        `${escapeTelegramHtml(persona.roleTitle)}\n` +
        `${escapeTelegramHtml(persona.essence)}`
      )
      : `${telegramBold('Active now')}: another Lucid entity.`,
    reply_markup: agentsKeyboard(refreshedBindings),
    parse_mode: 'HTML' as const,
  }
  const edited = await editTelegramKeyboard(botToken, chatId, cb.message.message_id, reply)
  if (!edited) {
    await sendTelegramMessage(botToken, chatId, reply)
  }

  await answerCallbackQuery(botToken, cb.id, persona ? `${persona.displayName} stepped in.` : 'Switched.')
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'telegram-hosted-webhook' })
}
