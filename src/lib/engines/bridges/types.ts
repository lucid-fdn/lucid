import type { AgentEngine, RuntimeProtocol } from '@/lib/engines/types'

export interface RuntimeBridgeMetadata {
  engine: AgentEngine
  runtimeProtocol: RuntimeProtocol
  runtimeVersion?: string | null
  engineVersion?: string | null
}

export interface RuntimeBridge {
  readonly engine: AgentEngine
  readonly runtimeProtocol: RuntimeProtocol
  buildHeartbeatMetadata(input?: {
    runtimeVersion?: string | null
    engineVersion?: string | null
  }): RuntimeBridgeMetadata
}
