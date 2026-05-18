import type {
  NativeChannelAdapter,
  NativeChannelHandlers,
  NativeChannelStartParams,
} from '../native/adapter-registry.js'

export interface HermesNativeTransportBridgeConfig {
  delegate: NativeChannelAdapter
}

/**
 * Hermes native transport boundary.
 *
 * Hermes reuses Lucid's engine-agnostic native channel adapters. This wrapper
 * gives Hermes an explicit engine-owned seam without reimplementing per-channel
 * transport logic that is already shared at the runtime-native layer.
 */
export class HermesNativeTransportAdapter implements NativeChannelAdapter {
  constructor(
    readonly channelType: string,
    readonly config: HermesNativeTransportBridgeConfig,
  ) {}

  async start(
    params: NativeChannelStartParams,
    signal: AbortSignal,
    handlers: NativeChannelHandlers,
  ): Promise<void> {
    return this.config.delegate.start(params, signal, handlers)
  }
}

export function createHermesNativeTransportAdapter(
  channelType: string,
  config: HermesNativeTransportBridgeConfig,
): NativeChannelAdapter {
  return new HermesNativeTransportAdapter(channelType, config)
}
