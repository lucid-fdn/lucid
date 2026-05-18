/**
 * Deployment Mode — Single source of truth
 *
 * Three deployment scenarios from the same codebase:
 * - saas: Lucid-hosted multi-tenant (default)
 * - self-hosted: Customer-hosted, all features unlocked
 * - hybrid: Customer worker + Lucid control plane
 */

import type { DeploymentMode } from '@/lib/mission-control/capabilities'
import { getL2ApiUrl, getL2GatewayBaseUrl } from '@/lib/lucid-l2/env'

export function getDeploymentMode(): DeploymentMode {
  if (typeof window === 'undefined') {
    return (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE as DeploymentMode) || 'saas'
  }
  return (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE as DeploymentMode) || 'saas'
}

export function isSelfHosted(): boolean {
  return getDeploymentMode() === 'self-hosted'
}

export function isL2Available(): boolean {
  // Server-side: check actual API URL aliases. Client-side: check public flag.
  return !!getL2ApiUrl() || process.env.NEXT_PUBLIC_L2_AVAILABLE === 'true'
}

/**
 * Resolve the L2 Gateway base URL (server-only).
 *
 * LUCID_L2_API_URL may include an `/api` suffix (for FlowSpec routes).
 * Agent endpoints live at the root (`/v1/agents/...`), so strip `/api`.
 * Returns `null` when L2 is not configured.
 */
export function getL2BaseUrl(): string | null {
  return getL2GatewayBaseUrl()
}
