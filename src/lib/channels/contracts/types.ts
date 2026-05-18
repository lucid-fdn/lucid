import 'server-only'

export interface ManagedDeliveryResult {
  delivered: boolean
  externalMessageId: string | null
  error?: string
}

export interface ManagedDeliveryIdentity {
  username?: string
  iconUrl?: string
  iconEmoji?: string
}

export interface ManagedDeliveryContext {
  secrets: Record<string, string>
  destinationId: string
  messageText: string
  replyToExternalId?: string | null
  channelConfig?: Record<string, unknown> | null
  identity?: ManagedDeliveryIdentity
}
