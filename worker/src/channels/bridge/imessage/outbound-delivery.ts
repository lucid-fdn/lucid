import { sendMessageIMessage } from '../openclaw-channel-shim.js'

function readConfigString(
  channelConfig: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  if (!channelConfig || typeof channelConfig !== 'object') return undefined

  for (const key of keys) {
    const value = channelConfig[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

export interface IMessageOutboundEvent {
  inbound_event_id: string | null
  message_text: string
  reply_to_external_id: string | null
}

export interface IMessageOutboundChannel {
  id: string
  external_channel_id: string | null
  connection_mode?: string | null
  channel_config?: Record<string, unknown> | null
}

export async function handleIMessageOutbound(params: {
  channel: IMessageOutboundChannel
  event: IMessageOutboundEvent
  secrets: Record<string, string>
  loadInboundMessageData: (inboundEventId: string | null) => Promise<Record<string, unknown> | null>
  enqueueHostedDispatch?: (payload: {
    surfaceId: string
    body: Record<string, unknown>
  }) => Promise<string>
}): Promise<string | null> {
  const shouldLoadInboundMessageData =
    !params.channel.external_channel_id ||
    !(params.channel.channel_config && typeof params.channel.channel_config === 'object')

  const inboundMessageData = shouldLoadInboundMessageData
    ? await params.loadInboundMessageData(params.event.inbound_event_id)
    : null

  const destinationId =
    typeof params.channel.external_channel_id === 'string' &&
    params.channel.external_channel_id.trim().length > 0
      ? params.channel.external_channel_id.trim()
      : typeof inboundMessageData?.imessage_target === 'string' &&
          inboundMessageData.imessage_target.trim().length > 0
        ? inboundMessageData.imessage_target.trim()
        : typeof inboundMessageData?.imessage_chat_identifier === 'string' &&
            inboundMessageData.imessage_chat_identifier.trim().length > 0
          ? inboundMessageData.imessage_chat_identifier.trim()
          : null

  if (!destinationId) {
    throw new Error('iMessage outbound recipient target is missing')
  }

  const hostedSurfaceId =
    params.channel.connection_mode === 'hosted' &&
    params.channel.channel_config &&
    typeof params.channel.channel_config === 'object' &&
    typeof params.channel.channel_config.hosted_surface_id === 'string' &&
    params.channel.channel_config.hosted_surface_id.trim().length > 0
      ? params.channel.channel_config.hosted_surface_id.trim()
      : null

  if (hostedSurfaceId) {
    if (!params.enqueueHostedDispatch) {
      throw new Error('Hosted iMessage outbound dispatch enqueue is not configured')
    }

    const dispatchId = await params.enqueueHostedDispatch({
      surfaceId: hostedSurfaceId,
      body: {
        target: destinationId,
        text: params.event.message_text,
        replyToId: params.event.reply_to_external_id,
        inboundEventId: params.event.inbound_event_id,
      },
    })

    return `provider-dispatch:${dispatchId}`
  }

  const cliPath =
    params.secrets.cli_path ||
    params.secrets.cliPath ||
    readConfigString(params.channel.channel_config, 'imessage_cli_path', 'imessageCliPath', 'cli_path', 'cliPath')
  const dbPath =
    params.secrets.db_path ||
    params.secrets.dbPath ||
    readConfigString(params.channel.channel_config, 'imessage_db_path', 'imessageDbPath', 'db_path', 'dbPath')
  const service =
    params.secrets.service ||
    readConfigString(params.channel.channel_config, 'imessage_service', 'imessageService', 'service')
  const region =
    params.secrets.region ||
    readConfigString(params.channel.channel_config, 'imessage_region', 'imessageRegion', 'region')
  const accountId =
    params.secrets.account_id ||
    params.secrets.accountId ||
    readConfigString(params.channel.channel_config, 'imessage_account_id', 'imessageAccountId', 'account_id', 'accountId')

  const result = await sendMessageIMessage(destinationId, params.event.message_text, {
    ...(cliPath ? { cliPath } : {}),
    ...(dbPath ? { dbPath } : {}),
    ...(service ? { service } : {}),
    ...(region ? { region } : {}),
    ...(accountId ? { accountId } : {}),
    ...(params.event.reply_to_external_id ? { replyToId: params.event.reply_to_external_id } : {}),
  })

  return result.messageId && result.messageId !== 'unknown'
    ? result.messageId
    : null
}
