import {
  getNativeChannelAdapter,
  registerNativeChannelAdapter,
  type NativeChannelAdapter,
  type NativeChannelHandlers,
  type NativeChannelStartParams,
} from '../native/adapter-registry.js'

export type RuntimeNativeTransportStartParams = NativeChannelStartParams
export type RuntimeNativeTransportHandlers = NativeChannelHandlers
export type RuntimeNativeTransport = NativeChannelAdapter
export type RuntimeNativeTransportEngine = 'openclaw' | 'hermes'
export type RuntimeNativeTransportSupportLevel = 'stable' | 'experimental' | 'unsupported'

const ENGINE_NATIVE_TRANSPORT_SUPPORT: Record<RuntimeNativeTransportEngine, RuntimeNativeTransportSupportLevel> = {
  openclaw: 'stable',
  hermes: 'experimental',
}

export class UnsupportedRuntimeNativeTransportError extends Error {
  constructor(engine: RuntimeNativeTransportEngine) {
    super(`Engine "${engine}" does not support runtime_native channels`)
    this.name = 'UnsupportedRuntimeNativeTransportError'
  }
}

export function registerRuntimeNativeTransport(adapter: RuntimeNativeTransport): void {
  registerNativeChannelAdapter(adapter)
}

export function getRuntimeNativeTransport(
  channelType: string,
): RuntimeNativeTransport | undefined {
  return getNativeChannelAdapter(channelType)
}

export function getRuntimeNativeTransportSupport(
  engine: RuntimeNativeTransportEngine,
): RuntimeNativeTransportSupportLevel {
  return ENGINE_NATIVE_TRANSPORT_SUPPORT[engine]
}

export function supportsRuntimeNativeTransport(
  engine: RuntimeNativeTransportEngine,
): boolean {
  return getRuntimeNativeTransportSupport(engine) !== 'unsupported'
}

export function assertRuntimeNativeTransportSupport(
  engine: RuntimeNativeTransportEngine,
): void {
  if (!supportsRuntimeNativeTransport(engine)) {
    throw new UnsupportedRuntimeNativeTransportError(engine)
  }
}
