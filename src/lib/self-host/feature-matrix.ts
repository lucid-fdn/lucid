/**
 * Feature matrix — single source of truth for what works in self-hosted vs cloud.
 *
 * Referenced by: docs, UI gating, startup checks, env validation, selfhost:doctor.
 */

import { getDeploymentMode } from '@/lib/deployment-mode'

type FeatureCategory =
  | 'auth'
  | 'llm'
  | 'integrations'
  | 'deployment'
  | 'billing'
  | 'launchpad'
  | 'channels'
  | 'observability'

export interface FeatureSpec {
  selfHosted: string[]
  cloud: string[]
}

export const featureMatrix = {
  auth: {
    selfHosted: ['local', 'privy'],
    cloud: ['privy'],
  },
  llm: {
    selfHosted: ['openai', 'anthropic', 'openai_compatible', 'trustgate_optional'],
    cloud: ['trustgate', 'byok'],
  },
  integrations: {
    selfHosted: ['manual', 'nango_optional'],
    cloud: ['managed_nango'],
  },
  deployment: {
    selfHosted: ['shared', 'dedicated_byo'],
    cloud: ['shared', 'dedicated_byo', 'l2_gateway_managed'],
  },
  billing: {
    selfHosted: [],
    cloud: ['stripe'],
  },
  launchpad: {
    selfHosted: ['disabled'],
    cloud: ['enabled'],
  },
  channels: {
    selfHosted: ['web', 'telegram_optional', 'discord_optional'],
    cloud: ['web', 'telegram', 'discord', 'whatsapp'],
  },
  observability: {
    selfHosted: ['basic_health', 'sentry_optional'],
    cloud: ['mission_control', 'consciousness_stream', 'otel'],
  },
} as const satisfies Record<FeatureCategory, FeatureSpec>

type DeploymentTarget = 'selfHosted' | 'cloud'

function resolveTarget(): DeploymentTarget {
  const mode = getDeploymentMode()
  return mode === 'self-hosted' ? 'selfHosted' : 'cloud'
}

/** Check if a feature is available for the given deployment target. */
export function isFeatureAvailable(
  category: FeatureCategory,
  feature: string,
  target?: DeploymentTarget
): boolean {
  const resolved = target ?? resolveTarget()
  const spec = featureMatrix[category]
  return (spec[resolved] as readonly string[]).includes(feature)
}

/** Get all features for a deployment target. */
export function getFeaturesForTarget(
  target?: DeploymentTarget
): Record<FeatureCategory, readonly string[]> {
  const resolved = target ?? resolveTarget()
  const result = {} as Record<FeatureCategory, readonly string[]>
  for (const [category, spec] of Object.entries(featureMatrix)) {
    result[category as FeatureCategory] = spec[resolved as keyof FeatureSpec]
  }
  return result
}
