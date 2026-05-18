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

export interface DiscordBridgeOptions {
  streaming?: Partial<StreamingConfig>
}

export interface DiscordBridgeRegistration {
  channelType: 'discord'
  outbound: OpenClawOutbound
  streaming: StreamingConfig
}

const DISCORD_DEFAULT_STREAMING: StreamingConfig = {
  supportsEditing: true,
  flushIntervalMs: 250,
  minBufferSize: 24,
  cursorIndicator: ' ▍',
}

export function createDiscordBridgeRegistration(
  plugin: OpenClawChannelPluginBridgeContract,
  options: DiscordBridgeOptions = {},
): DiscordBridgeRegistration {
  if (plugin.id !== 'discord') {
    throw new Error(`[bridge:discord] expected plugin.id='discord', got '${plugin.id}'`)
  }

  assertOpenClawOutboundContract('discord', plugin.outbound)

  return {
    channelType: 'discord',
    outbound: plugin.outbound as OpenClawOutbound,
    streaming: {
      ...DISCORD_DEFAULT_STREAMING,
      ...(options.streaming || {}),
    },
  }
}

export function createDiscordBridgeOutput(
  plugin: OpenClawChannelPluginBridgeContract,
  config: ChannelOutputConfig,
  options: DiscordBridgeOptions = {},
) {
  const registration = createDiscordBridgeRegistration(plugin, options)
  return new OpenClawChannelAdapter(registration.outbound, registration.streaming, config)
}
