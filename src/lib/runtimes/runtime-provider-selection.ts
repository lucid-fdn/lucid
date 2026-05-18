import type { RuntimeBlueprint } from '@contracts/project-blueprint'

import { BYO_PROVIDERS, MANAGED_PROVIDERS, PROVIDER_LABELS } from '@/lib/mission-control/constants'
import type { RuntimeProvider } from '@/lib/mission-control/types'

export type ByoSetupMode = 'manual' | 'provider'

export const MANUAL_RUNTIME_PROVIDER = 'manual' satisfies RuntimeProvider
export const DEFAULT_MANAGED_RUNTIME_PROVIDER = MANAGED_PROVIDERS[0]
export const DEFAULT_BYO_PROVIDER_RUNTIME_PROVIDER = 'railway' satisfies RuntimeProvider

export const BYO_PROVIDER_DEPLOY_TARGETS = BYO_PROVIDERS.filter(
  (provider) => provider !== MANUAL_RUNTIME_PROVIDER,
)

export function isRuntimeProvider(value: string | null | undefined): value is RuntimeProvider {
  return Boolean(value && value in PROVIDER_LABELS)
}

export function resolveByoSetupMode(provider: string | null | undefined): ByoSetupMode {
  return provider && provider !== MANUAL_RUNTIME_PROVIDER ? 'provider' : 'manual'
}

export function resolveRuntimeProviderForMode(
  runtime: Pick<RuntimeBlueprint, 'provider'> | null | undefined,
  mode: RuntimeBlueprint['mode'] | 'dedicated' | 'byo',
): RuntimeProvider {
  if (mode === 'dedicated') return DEFAULT_MANAGED_RUNTIME_PROVIDER
  if (mode === 'byo') {
    return isRuntimeProvider(runtime?.provider) ? runtime.provider : MANUAL_RUNTIME_PROVIDER
  }
  return DEFAULT_MANAGED_RUNTIME_PROVIDER
}

export function getRuntimeProviderLabel(provider: string | null | undefined): string {
  if (!provider) return 'Provider'
  return PROVIDER_LABELS[provider] ?? provider
}
