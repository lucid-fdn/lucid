import 'server-only'

import { decryptChannelSecrets } from '@/lib/channels/secrets'
import type { ServerDeliveryChannel } from './contracts'

export function resolveServerDeliverySecrets(
  channel: ServerDeliveryChannel,
): Record<string, string> {
  let secrets: Record<string, string> = {}

  if (channel.encrypted_secrets?.encrypted_data) {
    secrets = decryptChannelSecrets(channel.encrypted_secrets.encrypted_data)
  }

  const isHosted = !channel.encrypted_secrets?.encrypted_data
  if (!isHosted) return secrets

  if (channel.channel_type === 'telegram' && !secrets.bot_token) {
    const hostedToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
    if (!hostedToken) {
      throw new Error('TELEGRAM_HOSTED_BOT_TOKEN is not configured')
    }
    secrets.bot_token = hostedToken
  }

  if (channel.channel_type === 'discord' && !secrets.bot_token) {
    const hostedToken = process.env.DISCORD_HOSTED_BOT_TOKEN
    if (!hostedToken) {
      throw new Error('DISCORD_HOSTED_BOT_TOKEN is not configured')
    }
    secrets.bot_token = hostedToken
  }

  if (channel.channel_type === 'whatsapp' && !secrets.access_token) {
    const hostedAccessToken = process.env.WHATSAPP_HOSTED_ACCESS_TOKEN
    const hostedPhoneNumberId = process.env.WHATSAPP_HOSTED_PHONE_NUMBER_ID
    if (!hostedAccessToken || !hostedPhoneNumberId) {
      throw new Error('WHATSAPP_HOSTED_ACCESS_TOKEN / WHATSAPP_HOSTED_PHONE_NUMBER_ID is not configured')
    }
    secrets.access_token = hostedAccessToken
    secrets.phone_number_id = hostedPhoneNumberId
  }

  return secrets
}
