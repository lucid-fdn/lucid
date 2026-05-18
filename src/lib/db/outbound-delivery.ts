/**
 * Outbound Delivery — Server-side channel message delivery.
 *
 * Extracted from worker/src/processors/outbound.ts for reuse by the REST
 * relay (complete-inbound endpoint). Runs on the control plane (Next.js),
 * NOT the worker — has access to ENCRYPTION_KEY and channel credentials.
 */

import 'server-only'
import { supabase } from './client'
import type { ManagedDeliveryIdentity } from '@/lib/channels/contracts/types'
import { getServerDeliveryAdapter } from '@/lib/channels/server-delivery/adapters'
import type {
  DeliveryResult,
  ServerDeliveryChannel,
} from '@/lib/channels/server-delivery/contracts'
import { resolveServerDeliverySecrets } from '@/lib/channels/server-delivery/resolve-secrets'

interface SlackAssistantIdentityRow {
  id: string
  name: string
}

/**
 * Deliver a message to a channel using the server-side channel bridge plugins.
 * Loads channel config + decrypts secrets + sends via appropriate bridge.
 * Retries transient failures (network timeout, 5xx) up to 2 times.
 */
export async function deliverOutbound(
  channelId: string,
  messageText: string,
  replyToExternalId: string | null,
): Promise<DeliveryResult> {
  // 1. Load channel with secrets
  const { data: channel, error: channelError } = await supabase
    .from('assistant_channels')
    .select(`
      id, channel_type, external_channel_id, channel_config,
      assistant_id,
      encrypted_secrets:encrypted_secrets_id (
        id, encrypted_data
      )
    `)
    .eq('id', channelId)
    .single()

  if (channelError || !channel) {
    throw new Error(`Channel ${channelId} not found`)
  }

  const channelRecord = channel as Record<string, unknown>
  // Supabase returns encrypted_secrets as array from FK join — extract first element
  const encryptedSecretsValue = channelRecord.encrypted_secrets
  const rawSecrets = Array.isArray(encryptedSecretsValue)
    ? encryptedSecretsValue[0]
    : encryptedSecretsValue
  const typedChannel: ServerDeliveryChannel = {
    id: channel.id as string,
    channel_type: channel.channel_type as string,
    external_channel_id: channel.external_channel_id as string | null,
    assistant_id: channelRecord.assistant_id as string,
    encrypted_secrets: rawSecrets as { id: string; encrypted_data: string } | null,
    channel_config: channelRecord.channel_config as Record<string, unknown> | null,
  }

  const secrets = resolveServerDeliverySecrets(typedChannel)
  const slackIdentity =
    typedChannel.channel_type === 'slack'
      ? await resolveSlackOutboundIdentity(typedChannel.assistant_id)
      : null
  const adapter = getServerDeliveryAdapter(typedChannel.channel_type)
  if (!adapter) {
    throw new Error(`Unsupported channel type: ${typedChannel.channel_type}`)
  }

  return adapter.deliver({
    channel: typedChannel,
    secrets,
    messageText,
    replyToExternalId,
    identity: slackIdentity,
  })
}

async function resolveSlackOutboundIdentity(
  assistantId: string,
): Promise<ManagedDeliveryIdentity | null> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select('id, name')
    .eq('id', assistantId)
    .single<SlackAssistantIdentityRow>()

  if (error || !data?.name) {
    return null
  }

  const username = data.name.trim().slice(0, 80)
  if (!username) {
    return null
  }

  return { username }
}
