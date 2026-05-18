import {
  OpenClawChannelAdapter,
  type OpenClawOutbound,
  type StreamingConfig,
} from '../../ChannelAdapter.js'
import type { ChannelOutputConfig } from '../../ChannelOutput.js'
import {
  assertOpenClawOutboundContract,
  type OpenClawChannelPluginBridgeContract,
} from '../OpenClawBridgeContract.js'

export interface SlackBridgeOptions {
  streaming?: Partial<StreamingConfig>
}

export interface SlackBridgeRegistration {
  channelType: 'slack'
  outbound: OpenClawOutbound
  streaming: StreamingConfig
}

const SLACK_DEFAULT_STREAMING: StreamingConfig = {
  supportsEditing: true,
  flushIntervalMs: 350,
  minBufferSize: 32,
  cursorIndicator: ' ▍',
}

export function createSlackBridgeRegistration(
  plugin: OpenClawChannelPluginBridgeContract,
  options: SlackBridgeOptions = {},
): SlackBridgeRegistration {
  if (plugin.id !== 'slack') {
    throw new Error(`[bridge:slack] expected plugin.id='slack', got '${plugin.id}'`)
  }

  assertOpenClawOutboundContract('slack', plugin.outbound)

  const slackPlugin = plugin as OpenClawChannelPluginBridgeContract & {
    nativeStreaming?: {
      start?: (params: {
        channel: string
        threadTs: string
        text: string
        recipientTeamId?: string
        recipientUserId?: string
      }) => Promise<{ ok: boolean; streamId?: string; error?: string }>
      append?: (params: { streamId: string; text: string }) => Promise<{ ok: boolean; error?: string }>
      stop?: (params: { streamId: string; text?: string }) => Promise<{ ok: boolean; error?: string }>
      setStatus?: (params: { channel: string; threadTs: string; status: string }) => Promise<{ ok: boolean; error?: string }>
    }
  }

  const outbound: OpenClawOutbound = {
    ...(plugin.outbound as OpenClawOutbound),
    ...(slackPlugin.nativeStreaming?.start
      ? {
          startNativeStream: async (params) => {
            const result = await slackPlugin.nativeStreaming!.start!({
              channel: params.to,
              threadTs: params.threadId ?? params.replyToId ?? '',
              text: params.text,
              recipientTeamId: params.recipientTeamId,
              recipientUserId: params.recipientUserId,
            })
            return { channel: 'slack', ok: result.ok, streamId: result.streamId, error: result.error }
          },
        }
      : {}),
    ...(slackPlugin.nativeStreaming?.append
      ? {
          appendNativeStream: async (params) => {
            const result = await slackPlugin.nativeStreaming!.append!(params)
            return { channel: 'slack', ok: result.ok, error: result.error }
          },
        }
      : {}),
    ...(slackPlugin.nativeStreaming?.stop
      ? {
          stopNativeStream: async (params) => {
            const result = await slackPlugin.nativeStreaming!.stop!(params)
            return { channel: 'slack', ok: result.ok, error: result.error }
          },
        }
      : {}),
    ...(slackPlugin.nativeStreaming?.setStatus
      ? {
          setNativeStatus: async (params) => {
            const result = await slackPlugin.nativeStreaming!.setStatus!(params)
            return { channel: 'slack', ok: result.ok, error: result.error }
          },
        }
      : {}),
  }

  return {
    channelType: 'slack',
    outbound,
    streaming: {
      ...SLACK_DEFAULT_STREAMING,
      ...(options.streaming || {}),
    },
  }
}

export function createSlackBridgeOutput(
  plugin: OpenClawChannelPluginBridgeContract,
  config: ChannelOutputConfig,
  options: SlackBridgeOptions = {},
) {
  const registration = createSlackBridgeRegistration(plugin, options)
  return new OpenClawChannelAdapter(registration.outbound, registration.streaming, config)
}
