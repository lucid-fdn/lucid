import type { AgentEngine, RuntimeFlavor } from './types'
import { isL2Available } from '@/lib/deployment-mode'
import { getRuntimeImageConfigurationError } from './image-resolution'

export interface EngineDeployReadiness {
  engine: AgentEngine
  runtimeFlavor: RuntimeFlavor
  provider: string | null
  ready: boolean
  imageConfigured: boolean
  l2Configured: boolean
  blockerLabel: string | null
  error: string | null
  note: string | null
}

function getHermesReadinessNote(runtimeFlavor: RuntimeFlavor): string | null {
  if (runtimeFlavor === 'shared') return 'Experimental'
  return 'Experimental • Relay only'
}

export function getEngineDeployReadiness(params: {
  engine: AgentEngine
  runtimeFlavor: RuntimeFlavor
  provider?: string | null
}): EngineDeployReadiness {
  const provider = params.provider ?? null
  const requiresProvisioning = params.runtimeFlavor !== 'shared' && provider !== 'manual'
  const imageError =
    params.runtimeFlavor === 'shared'
      ? null
      : getRuntimeImageConfigurationError(
          params.engine,
          params.runtimeFlavor as Exclude<RuntimeFlavor, 'shared'>,
        )
  const imageConfigured = !imageError
  const l2Configured = !requiresProvisioning || isL2Available()

  if (params.engine !== 'hermes') {
    return {
      engine: params.engine,
      runtimeFlavor: params.runtimeFlavor,
      provider,
      ready: true,
      imageConfigured: true,
      l2Configured: true,
      blockerLabel: null,
      error: null,
      note: null,
    }
  }

  let blockerLabel: string | null = null
  let error: string | null = null

  if (!imageConfigured) {
    blockerLabel = params.runtimeFlavor === 'c1_managed' ? 'Not configured' : 'No runtime image'
    error = imageError
  } else if (!l2Configured) {
    blockerLabel = 'L2 unavailable'
    error = 'L2 Gateway is not configured for this environment.'
  }

  return {
    engine: params.engine,
    runtimeFlavor: params.runtimeFlavor,
    provider,
    ready: !blockerLabel,
    imageConfigured,
    l2Configured,
    blockerLabel,
    error,
    note: getHermesReadinessNote(params.runtimeFlavor),
  }
}

