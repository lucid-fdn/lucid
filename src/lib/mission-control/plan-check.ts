import 'server-only'

import { isInternalOrg } from '@/lib/auth/internal'
import { isSelfHosted } from '@/lib/deployment-mode'
import { getResolvedPlanLimits } from '@/lib/access-control/server'

/**
 * Can the org use Lucid-managed runtimes?
 * Self-hosted: always. Internal: always. SaaS: Pro+ plan required.
 */
export async function canUseManagedRuntime(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeDedicatedEnabled
}

/**
 * Can the org use BYO (bring your own) runtimes?
 * Self-hosted: always. Internal: always. SaaS: Business+ plan required.
 */
export async function canUseByo(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeByoEnabled
}

export async function canUseNativeRuntimeChannels(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeNativeChannels
}

export async function canUseRuntimeNetworkControls(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeNetworkControls
}

export async function canUseRuntimeCustomLimits(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeCustomLimits
}

export async function canUseRuntimeMaintenance(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeMaintenance
}

export async function canUseRuntimeFullAutoUpdates(orgId: string): Promise<boolean> {
  if (isSelfHosted()) return true
  if (isInternalOrg(orgId)) return true
  const limits = await getResolvedPlanLimits(orgId)
  return limits.runtimeFullAutoUpdates
}
