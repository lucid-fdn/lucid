import type { RuntimeBridge } from '@/lib/engines/bridges/types'

export class OpenClawRuntimeBridge implements RuntimeBridge {
  readonly engine = 'openclaw' as const
  readonly runtimeProtocol = 'lucid-runtime-v1' as const

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
