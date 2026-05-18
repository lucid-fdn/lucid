import type { RuntimeBridge } from '@/lib/engines/bridges/types'

export class HermesRuntimeBridge implements RuntimeBridge {
  readonly engine = 'hermes' as const
  readonly runtimeProtocol = 'lucid-runtime-v2' as const

  buildHeartbeatMetadata(input?: {
    runtimeVersion?: string | null
    engineVersion?: string | null
  }) {
    return {
      engine: this.engine,
      runtimeProtocol: this.runtimeProtocol,
      runtimeVersion: input?.runtimeVersion ?? null,
      engineVersion: input?.engineVersion ?? null,
    }
  }
}
