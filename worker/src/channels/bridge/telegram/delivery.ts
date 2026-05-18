import type { SupabaseClient } from '@supabase/supabase-js'

import { PermanentChannelError } from '../../errors.js'
import {
  buildTelegramLinkPreviewOptions,
  decorateTelegramSpeakerDelivery,
} from './presentation.js'

export interface TelegramDeliveryAssistantIdentity {
  id: string | null
  name: string
}

export interface TelegramDeliveryChannel {
  assistant_id?: string | null
  external_channel_id: string | null
  ai_assistants?:
    | {
        name?: string | null
        telegram_display_name?: string | null
      }
    | Array<{
        name?: string | null
        telegram_display_name?: string | null
      }>
}

interface TelegramRoomBinding {
  assistant_id?: string | null
  is_primary?: boolean
  ai_assistants?:
    | {
        name?: string | null
        telegram_display_name?: string | null
      }
    | Array<{
        name?: string | null
        telegram_display_name?: string | null
      }>
}

export function getTelegramAssistantIdentity(
  channel: TelegramDeliveryChannel,
): TelegramDeliveryAssistantIdentity {
  const ai = Array.isArray(channel.ai_assistants) ? channel.ai_assistants[0] : channel.ai_assistants
  return {
    id: channel.assistant_id ?? null,
    name: ai?.telegram_display_name || ai?.name || 'Another agent',
  }
}

export async function resolveTelegramDelivery(params: {
  supabase: SupabaseClient
  channel: TelegramDeliveryChannel
  text: string
  hosted: boolean
  inboundMessageData?: Record<string, unknown> | null
}): Promise<{
  chatId: string
  text: string
  platformOptions?: Record<string, unknown>
}> {
  const chatId =
    params.channel.external_channel_id
    ?? (typeof params.inboundMessageData?.telegram_chat_id === 'string'
      ? params.inboundMessageData.telegram_chat_id
      : null)
  if (!chatId) {
    throw new PermanentChannelError('Telegram channel has no external chat id')
  }

  const sender = getTelegramAssistantIdentity(params.channel)
  if (!sender.id) {
    return { chatId, text: params.text, platformOptions: buildTelegramLinkPreviewOptions(params.text) }
  }

  const { data, error } = await params.supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_primary, ai_assistants(name, telegram_display_name)')
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)

  if (error || !data || data.length === 0) {
    return { chatId, text: params.text, platformOptions: buildTelegramLinkPreviewOptions(params.text) }
  }

  const primary = (data as unknown as TelegramRoomBinding[]).find(
    (row) => row.is_primary === true,
  )
  if (!primary || primary.assistant_id === sender.id) {
    return { chatId, text: params.text, platformOptions: buildTelegramLinkPreviewOptions(params.text) }
  }

  return {
    chatId,
    ...decorateTelegramSpeakerDelivery({
      text: params.text,
      senderName: sender.name,
      senderId: sender.id,
      hosted: params.hosted,
    }),
  }
}
