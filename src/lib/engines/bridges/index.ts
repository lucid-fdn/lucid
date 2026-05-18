import type { AgentEngine } from '@/lib/engines/types'
import type { RuntimeBridge } from '@/lib/engines/bridges/types'
import { OpenClawRuntimeBridge } from '@/lib/engines/openclaw/OpenClawRuntimeBridge'
import { HermesRuntimeBridge } from '@/lib/engines/hermes/HermesRuntimeBridge'

const runtimeBridges: Partial<Record<AgentEngine, RuntimeBridge>> = {
  openclaw: new OpenClawRuntimeBridge(),
  hermes: new HermesRuntimeBridge(),
}

export function getRuntimeBridge(engine: AgentEngine): RuntimeBridge {
  const bridge = runtimeBridges[engine]
  if (!bridge) {
    throw new Error(`No runtime bridge registered for engine "${engine}"`)
  }
  return bridge
}

export type { RuntimeBridge, RuntimeBridgeMetadata } from '@/lib/engines/bridges/types'
