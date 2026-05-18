import 'server-only'

import { splitTelegramMessage } from '@/lib/telegram/chunking'
import { sendTeamsText } from '@/lib/channels/msteams/send'
import type { DeliveryResult } from './contracts'

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok || res.status < 500) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  throw lastError ?? new Error('Delivery failed after retries')
}

function extractTelegramPhotoPayload(text: string): { photoUrl: string; caption?: string } | null {
  const markdownImage = text.match(/!\[[^\]]*]\((https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp))(?:\?[^\s)]*)?\)/i)
  if (markdownImage) {
    const photoUrl = markdownImage[1]
    const caption = text.replace(markdownImage[0], '').trim()
    return { photoUrl, ...(caption ? { caption } : {}) }
  }

  const trimmed = text.trim()
  if (/^https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?$/i.test(trimmed)) {
    return { photoUrl: trimmed }
  }

  return null
}

export async function sendTelegramLegacy(
  secrets: Record<string, string>,
  chatId: string,
  text: string,
  replyToId: string | null,
): Promise<DeliveryResult> {
  const token = secrets.bot_token
  if (!token) throw new Error('Telegram bot token not configured')

  const photoPayload = extractTelegramPhotoPayload(text)
  if (photoPayload) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoPayload.photoUrl,
      ...(photoPayload.caption ? { caption: photoPayload.caption } : {}),
    }
    if (replyToId) {
      body.reply_to_message_id = replyToId
      body.allow_sending_without_reply = true
    }

    const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!data.ok) throw new Error(`Telegram: ${data.description || 'Unknown error'}`)
    return {
      delivered: true,
      externalMessageId: data.result?.message_id ? String(data.result.message_id) : null,
    }
  }

  const chunks = splitTelegramMessage(text)
  if (chunks.length === 0) {
    return { delivered: true, externalMessageId: null }
  }

  let firstMessageId: string | null = null
  for (let i = 0; i < chunks.length; i += 1) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
    }
    if (i === 0 && replyToId) {
      body.reply_to_message_id = replyToId
      body.allow_sending_without_reply = true
    }

    const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!data.ok) throw new Error(`Telegram: ${data.description || 'Unknown error'}`)
    if (i === 0 && data.result?.message_id) {
      firstMessageId = String(data.result.message_id)
    }
  }

  return { delivered: true, externalMessageId: firstMessageId }
}

export async function sendWhatsAppLegacy(
  secrets: Record<string, string>,
  to: string,
  text: string,
): Promise<DeliveryResult> {
  const token = secrets.access_token || secrets.whatsapp_token
  const phoneNumberId = secrets.phone_number_id
  if (!token || !phoneNumberId) throw new Error('WhatsApp credentials not configured')

  const res = await fetchWithRetry(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })

  const data = (await res.json()) as { messages?: Array<{ id: string }> }
  return { delivered: true, externalMessageId: data.messages?.[0]?.id ?? null }
}

export async function sendDiscordLegacy(
  secrets: Record<string, string>,
  channelId: string,
  text: string,
  replyToId: string | null,
): Promise<DeliveryResult> {
  const token = secrets.bot_token
  if (!token) throw new Error('Discord bot token not configured')

  const body: Record<string, unknown> = { content: text.slice(0, 2000) }
  if (replyToId) body.message_reference = { message_id: replyToId }

  const res = await fetchWithRetry(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as { id?: string }
  if (!res.ok) throw new Error(`Discord: ${res.status}`)
  return { delivered: true, externalMessageId: data.id ?? null }
}

export async function sendSlackLegacy(
  secrets: Record<string, string>,
  channelId: string,
  text: string,
  replyToId: string | null,
): Promise<DeliveryResult> {
  const token = secrets.bot_token
  if (!token) throw new Error('Slack bot token not configured')

  const body: Record<string, unknown> = {
    channel: channelId,
    text: text.slice(0, 40_000),
  }
  if (replyToId) body.thread_ts = replyToId

  const res = await fetchWithRetry('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string }
  if (!data.ok) throw new Error(`Slack: ${data.error || 'Unknown error'}`)
  return { delivered: true, externalMessageId: data.ts ?? null }
}

export async function sendTeamsLegacy(
  secrets: Record<string, string>,
  conversationId: string,
  text: string,
  replyToActivityId: string | null,
  channelConfig?: Record<string, unknown> | null,
): Promise<DeliveryResult> {
  const appId = secrets.app_id
  const appPassword = secrets.app_password
  const tenantId = secrets.tenant_id || 'common'
  const serviceUrl = secrets.service_url
    || (channelConfig?.teams_service_url as string | undefined)
    || 'https://smba.trafficmanager.net/teams'
  if (!appId || !appPassword) {
    throw new Error('Teams app credentials not configured (app_id + app_password required)')
  }

  const result = await sendTeamsText({
    appId,
    appPassword,
    tenantId,
    serviceUrl,
    conversationId,
    text,
    replyToActivityId,
  })

  return { delivered: true, externalMessageId: result.externalMessageId }
}
