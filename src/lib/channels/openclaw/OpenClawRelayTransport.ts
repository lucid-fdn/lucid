import 'server-only'

import type { RelayTransportAdapter } from '@/lib/channels/contracts/RelayTransportAdapter'
import type { ManagedDeliveryContext } from '@/lib/channels/contracts/types'
import { sendDiscordViaShim } from '@/lib/channels/openclaw-shim/discord/send'
import { sendIMessageViaShim } from '@/lib/channels/openclaw-shim/imessage/send'
import { sendSlackViaShim } from '@/lib/channels/openclaw-shim/slack/send'
import { sendTelegramViaShim } from '@/lib/channels/openclaw-shim/telegram/send'
import { sendTeamsViaShim } from '@/lib/channels/openclaw-shim/msteams/send'
import { sendWhatsAppViaShim } from '@/lib/channels/openclaw-shim/whatsapp/send'

class OpenClawDiscordRelayTransport implements RelayTransportAdapter {
  readonly channelType = 'discord'

  async send(context: ManagedDeliveryContext) {
    return sendDiscordViaShim(
      context.secrets,
      context.destinationId,
      context.messageText,
      context.replyToExternalId ?? null,
    )
  }
}

class OpenClawTelegramRelayTransport implements RelayTransportAdapter {
  readonly channelType = 'telegram'

  async send(context: ManagedDeliveryContext) {
    return sendTelegramViaShim(
      context.secrets,
      context.destinationId,
      context.messageText,
      context.replyToExternalId ?? null,
    )
  }
}

class OpenClawSlackRelayTransport implements RelayTransportAdapter {
  readonly channelType = 'slack'

  async send(context: ManagedDeliveryContext) {
    return sendSlackViaShim(
      context.secrets,
      context.destinationId,
      context.messageText,
      context.replyToExternalId ?? null,
      context.identity,
    )
  }
}

class OpenClawTeamsRelayTransport implements RelayTransportAdapter {
  readonly channelType = 'msteams'

  async send(context: ManagedDeliveryContext) {
    return sendTeamsViaShim(
      context.secrets,
      context.destinationId,
      context.messageText,
      context.replyToExternalId ?? null,
      context.channelConfig,
    )
  }
}

class OpenClawWhatsAppRelayTransport implements RelayTransportAdapter {
  readonly channelType = 'whatsapp'

  async send(context: ManagedDeliveryContext) {
    return sendWhatsAppViaShim(
      context.secrets,
      context.destinationId,
      context.messageText,
    )
  }
}

class OpenClawIMessageRelayTransport implements RelayTransportAdapter {
  readonly channelType = 'imessage'

  async send(context: ManagedDeliveryContext) {
    return sendIMessageViaShim(
      context.secrets,
      context.destinationId,
      context.messageText,
      context.replyToExternalId ?? null,
      context.channelConfig,
    )
  }
}

const openClawRelayTransports: Record<string, RelayTransportAdapter> = {
  discord: new OpenClawDiscordRelayTransport(),
  imessage: new OpenClawIMessageRelayTransport(),
  telegram: new OpenClawTelegramRelayTransport(),
  slack: new OpenClawSlackRelayTransport(),
  msteams: new OpenClawTeamsRelayTransport(),
  whatsapp: new OpenClawWhatsAppRelayTransport(),
}

export function getOpenClawRelayTransport(channelType: string): RelayTransportAdapter | null {
  return openClawRelayTransports[channelType] ?? null
}
