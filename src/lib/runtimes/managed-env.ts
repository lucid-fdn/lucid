import 'server-only'

import { buildDeployEnvVars } from '@/app/api/runtimes/_deploy'
import type { DedicatedRuntime } from '@/lib/mission-control/types'

export function buildManagedRuntimeEnvVars(runtime: DedicatedRuntime): Record<string, string> {
  return buildDeployEnvVars(runtime.id, runtime.channelMode ?? null, {
    engine: runtime.engine ?? 'openclaw',
    runtimeFlavor:
      runtime.runtimeFlavor === 'c1_managed' || runtime.runtimeFlavor === 'c2a_autonomous'
        ? runtime.runtimeFlavor
        : 'c1_managed',
    runtimeProtocol: runtime.runtimeProtocol ?? 'lucid-runtime-v1',
    dedicatedTransportMode: runtime.dedicatedTransportMode ?? null,
    runtimeBootstrapConfig: runtime.runtimeBootstrapConfig ?? null,
  })
}
