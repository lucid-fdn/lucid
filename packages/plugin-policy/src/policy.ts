/**
 * Capability Core — Policy Engine
 *
 * Resolves the effective execution mode for a plugin based on:
 *   1. Admin blocklist
 *   2. Trust level → execution mode matrix
 *   3. Environment overrides (e.g., force gateway in staging)
 *
 * Policy matrix (RFC Section 4.2):
 *   internal  + in_process → allow_in_process
 *   internal  + gateway    → allow_gateway
 *   verified  + in_process → allow_in_process
 *   verified  + gateway    → allow_gateway
 *   community + in_process → allow_gateway (OVERRIDE — community never runs in-process)
 *   community + gateway    → allow_gateway
 */

import type { PluginCatalogEntry, PolicyConfig, PolicyResult } from './types.js'

/**
 * Resolve the execution policy for a plugin.
 * Takes the full catalog entry so policy can inspect any field.
 */
export function resolvePolicy(
  plugin: Pick<PluginCatalogEntry, 'slug' | 'trustLevel' | 'executionMode'>,
  config?: PolicyConfig,
): PolicyResult {
  // 1. Admin blocklist
  if (config?.blockedPlugins?.includes(plugin.slug)) {
    return {
      decision: 'block',
      reason: `Plugin "${plugin.slug}" is on the admin blocklist`,
      effectiveMode: 'gateway',
    }
  }

  // 2. Environment override — force everything through gateway
  if (config?.forceGateway) {
    return {
      decision: 'allow_gateway',
      reason: 'Environment forces gateway mode',
      effectiveMode: 'gateway',
    }
  }

  // 3. Trust level → execution mode matrix
  // Default undefined to safest posture (community + gateway) — matches DB column defaults.
  // Without this, an old DB row missing these fields would fall through to allow_in_process.
  const trustLevel = plugin.trustLevel ?? 'community'
  const executionMode = plugin.executionMode ?? 'gateway'

  // Community plugins: NEVER in-process, regardless of requested mode
  if (trustLevel === 'community') {
    return {
      decision: 'allow_gateway',
      reason: 'Community plugins are gateway-only (policy enforced)',
      effectiveMode: 'gateway',
    }
  }

  // Internal or verified: respect the requested execution mode
  if (executionMode === 'in_process') {
    return {
      decision: 'allow_in_process',
      reason: `${trustLevel} plugin allowed in-process`,
      effectiveMode: 'in_process',
    }
  }

  return {
    decision: 'allow_gateway',
    reason: `${trustLevel} plugin requested gateway mode`,
    effectiveMode: 'gateway',
  }
}
