import 'server-only'

import { FEATURES } from '@/lib/features'
import { getOpenClawRelayTransport } from '@/lib/channels/openclaw/OpenClawRelayTransport'
import type { ServerDeliveryAdapter, ServerDeliveryContext, DeliveryResult } from './contracts'
import {
  sendDiscordLegacy,
  sendSlackLegacy,
  sendTeamsLegacy,
  sendTelegramLegacy,
  sendWhatsAppLegacy,
} from './legacy-senders'

function shouldFallbackToLegacySender(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return (
    message.includes("Cannot find package '@lucid/openclaw-runtime'") ||
    message.includes("Cannot find module '@lucid/openclaw-runtime'") ||
    message.includes('sendMessageMSTeams is not available in the current openclaw-runtime version')
  )
}

async function sendViaManagedOrLegacy(
  channelType: 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'msteams',
  context: ServerDeliveryContext,
  legacySend: () => Promise<DeliveryResult>,
  managedEnabled: boolean,
): Promise<DeliveryResult> {
  if (!managedEnabled) return legacySend()

  const adapter = getOpenClawRelayTransport(channelType)
  if (!adapter) {
    throw new Error(`Managed relay transport not configured for ${channelType}`)
  }

  try {
    return await adapter.send({
      secrets: context.secrets,
      destinationId: context.channel.external_channel_id!,
      messageText: context.messageText,
      replyToExternalId: context.replyToExternalId,
      ...(context.identity ? { identity: context.identity } : {}),
      ...(context.channel.channel_config ? { channelConfig: context.channel.channel_config } : {}),
    })
  } catch (err) {
    if (!shouldFallbackToLegacySender(err)) throw err
    return legacySend()
  }
}

async function sendViaManagedOnly(
  channelType: 'imessage',
  context: ServerDeliveryContext,
  managedEnabled: boolean,
): Promise<DeliveryResult> {
  if (!managedEnabled) {
    throw new Error(`Managed relay delivery for ${channelType} is disabled`)
  }

  const adapter = getOpenClawRelayTransport(channelType)
  if (!adapter) {
    throw new Error(`Managed relay transport not configured for ${channelType}`)
  }

  return adapter.send({
    secrets: context.secrets,
    destinationId: context.channel.external_channel_id!,
    messageText: context.messageText,
    replyToExternalId: context.replyToExternalId,
    ...(context.channel.channel_config ? { channelConfig: context.channel.channel_config } : {}),
  })
}

const telegramAdapter: ServerDeliveryAdapter = {
  channelType: 'telegram',
  deliver(context) {
    return sendViaManagedOrLegacy(
      'telegram',
      context,
      () =>
        sendTelegramLegacy(
          context.secrets,
          context.channel.external_channel_id!,
          context.messageText,
          context.replyToExternalId,
        ),
      FEATURES.openclawChannelsTelegramManaged,
    )
  },
}

const whatsappAdapter: ServerDeliveryAdapter = {
  channelType: 'whatsapp',
  deliver(context) {
    return sendViaManagedOrLegacy(
      'whatsapp',
      context,
      () =>
        sendWhatsAppLegacy(
          context.secrets,
          context.channel.external_channel_id!,
          context.messageText,
        ),
      FEATURES.openclawChannelsWhatsAppManaged,
    )
  },
}

const discordAdapter: ServerDeliveryAdapter = {
  channelType: 'discord',
  deliver(context) {
    return sendViaManagedOrLegacy(
      'discord',
      context,
      () =>
        sendDiscordLegacy(
          context.secrets,
          context.channel.external_channel_id!,
          context.messageText,
          context.replyToExternalId,
        ),
      FEATURES.openclawChannelsDiscordManaged,
    )
  },
}

const slackAdapter: ServerDeliveryAdapter = {
  channelType: 'slack',
  deliver(context) {
    return sendViaManagedOrLegacy(
      'slack',
      context,
      () =>
        sendSlackLegacy(
          context.secrets,
          context.channel.external_channel_id!,
          context.messageText,
          context.replyToExternalId,
        ),
      FEATURES.openclawChannelsSlackManaged,
    )
  },
}

const teamsAdapter: ServerDeliveryAdapter = {
  channelType: 'msteams',
  deliver(context) {
    return sendViaManagedOrLegacy(
      'msteams',
      context,
      () =>
        sendTeamsLegacy(
          context.secrets,
          context.channel.external_channel_id!,
          context.messageText,
          context.replyToExternalId,
          context.channel.channel_config,
        ),
      FEATURES.openclawChannelsTeamsManaged,
    )
  },
}

const imessageAdapter: ServerDeliveryAdapter = {
  channelType: 'imessage',
  deliver(context) {
    return sendViaManagedOnly(
      'imessage',
      context,
      FEATURES.openclawChannelsIMessageManaged,
    )
  },
}

const webAdapter: ServerDeliveryAdapter = {
  channelType: 'web',
  async deliver() {
    return { delivered: true, externalMessageId: `web-${Date.now()}` }
  },
}

const SERVER_DELIVERY_ADAPTERS: Record<string, ServerDeliveryAdapter> = {
  telegram: telegramAdapter,
  whatsapp: whatsappAdapter,
  discord: discordAdapter,
  imessage: imessageAdapter,
  slack: slackAdapter,
  msteams: teamsAdapter,
  web: webAdapter,
}

export function getServerDeliveryAdapter(channelType: string): ServerDeliveryAdapter | null {
  return SERVER_DELIVERY_ADAPTERS[channelType] ?? null
}
