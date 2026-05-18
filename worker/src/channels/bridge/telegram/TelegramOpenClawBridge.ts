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

/**
 * P2-15a skeleton bridge for vendored OpenClaw Telegram plugin outbound.
 *
 * NOTE: This only adapts outbound delivery mechanics.
 * Control-plane invariants (dedup/lock/rate/policy/encryption/runId)
 * remain in inbound processor pipeline.
 */

export interface TelegramBridgeOptions {
  streaming?: Partial<StreamingConfig>
}

export interface TelegramBridgeRegistration {
  channelType: 'telegram'
  outbound: OpenClawOutbound
  streaming: StreamingConfig
}

const TELEGRAM_DEFAULT_STREAMING: StreamingConfig = {
  // Telegram OpenClaw outbound is markdown/direct today. We keep editing enabled
  // as a capability flag, while adapter policy still suppresses markdown streaming.
  supportsEditing: true,
  flushIntervalMs: 1000,
  minBufferSize: 80,
  cursorIndicator: ' ▍',
}

export function createTelegramBridgeRegistration(
  plugin: OpenClawChannelPluginBridgeContract,
  options: TelegramBridgeOptions = {},
): TelegramBridgeRegistration {
  if (plugin.id !== 'telegram') {
    throw new Error(`[bridge:telegram] expected plugin.id='telegram', got '${plugin.id}'`)
  }

  assertOpenClawOutboundContract('telegram', plugin.outbound)

  return {
    channelType: 'telegram',
    outbound: plugin.outbound as OpenClawOutbound,
    streaming: {
      ...TELEGRAM_DEFAULT_STREAMING,
      ...(options.streaming || {}),
    },
  }
}

export function createTelegramBridgeOutput(
  plugin: OpenClawChannelPluginBridgeContract,
  config: ChannelOutputConfig,
  options: TelegramBridgeOptions = {},
) {
  const registration = createTelegramBridgeRegistration(plugin, options)
  return new OpenClawChannelAdapter(registration.outbound, registration.streaming, config)
}
