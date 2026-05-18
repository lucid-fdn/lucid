import type { ManagedDeliveryIdentity } from '@/lib/channels/contracts/types'

export interface DeliveryResult {
  delivered: boolean
  externalMessageId: string | null
  error?: string
}

export interface ServerDeliveryChannel {
  id: string
  channel_type: string
  external_channel_id: string | null
  channel_config: Record<string, unknown> | null
  assistant_id: string
  encrypted_secrets: { id: string; encrypted_data: string } | null
}

export interface ServerDeliveryContext {
  channel: ServerDeliveryChannel
  secrets: Record<string, string>
  messageText: string
  replyToExternalId: string | null
  identity?: ManagedDeliveryIdentity | null
}

export interface ServerDeliveryAdapter {
  channelType: 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'msteams' | 'imessage' | 'web'
  deliver(context: ServerDeliveryContext): Promise<DeliveryResult>
}
