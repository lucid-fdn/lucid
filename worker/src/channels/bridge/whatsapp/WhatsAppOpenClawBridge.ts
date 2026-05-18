/**
 * WhatsApp OpenClaw Bridge — adapts the WhatsApp plugin to our ChannelOutput lifecycle.
 *
 * Follows the same pattern as TelegramOpenClawBridge.ts.
 * WhatsApp is non-streaming (direct delivery, no message editing).
 */

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

export interface WhatsAppBridgeOptions {
  streaming?: Partial<StreamingConfig>
}

export interface WhatsAppBridgeRegistration {
  channelType: 'whatsapp'
  outbound: OpenClawOutbound
  streaming: StreamingConfig
}

const WHATSAPP_DEFAULT_STREAMING: StreamingConfig = {
  // WhatsApp does NOT support message editing — no streaming UX
  supportsEditing: false,
  flushIntervalMs: 1000,
  minBufferSize: 80,
  cursorIndicator: '',
}

export function createWhatsAppBridgeRegistration(
  plugin: OpenClawChannelPluginBridgeContract,
  options: WhatsAppBridgeOptions = {},
): WhatsAppBridgeRegistration {
  if (plugin.id !== 'whatsapp') {
    throw new Error(`[bridge:whatsapp] expected plugin.id='whatsapp', got '${plugin.id}'`)
  }

  assertOpenClawOutboundContract('whatsapp', plugin.outbound)

  return {
    channelType: 'whatsapp',
    outbound: plugin.outbound as OpenClawOutbound,
    streaming: {
      ...WHATSAPP_DEFAULT_STREAMING,
      ...(options.streaming || {}),
    },
  }
}

export function createWhatsAppBridgeOutput(
  plugin: OpenClawChannelPluginBridgeContract,
  config: ChannelOutputConfig,
  options: WhatsAppBridgeOptions = {},
) {
  const registration = createWhatsAppBridgeRegistration(plugin, options)
  return new OpenClawChannelAdapter(registration.outbound, registration.streaming, config)
}