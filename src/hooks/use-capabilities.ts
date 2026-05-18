'use client'

/**
 * Mission Control — Capability Resolution Hook
 *
 * Reads deployment mode from env + plan from workspace context.
 * Filters capability registry. Returns resolved capabilities.
 *
 * Self-hosted mode: all capabilities enabled regardless of plan.
 */

import { useMemo } from 'react'
import { useWorkspace } from '@/contexts/workspace-context'
import { CAPABILITY_REGISTRY } from '@/lib/mission-control/capability-registry'
import { getDeploymentMode, isSelfHosted } from '@/lib/deployment-mode'
import { isInternalWorkspace } from '@/lib/auth/internal'
import { normalizeWorkspacePlanName } from '@/lib/access-control/types'
import type { Capability, PlanTier } from '@/lib/mission-control/capabilities'

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  business: 2,
}

function getPlanTier(planName?: string | null): PlanTier {
  const normalized = normalizeWorkspacePlanName(planName)
  if (normalized === 'business') return 'business'
  if (normalized === 'pro') return 'pro'
  return 'free'
}

export function useCapabilities() {
  const { workspace } = useWorkspace()
  const deploymentMode = getDeploymentMode()
  const selfHosted = isSelfHosted()
  const plan = getPlanTier(workspace?.subscription?.plan_name)
  const internalWorkspace = workspace
    ? isInternalWorkspace(workspace.org.id, workspace.org.slug)
    : false

  const capabilities = useMemo(() => {
    // Self-hosted and internal workspaces: all capabilities enabled, no plan/mode filtering
    if (selfHosted || internalWorkspace) {
      return [...CAPABILITY_REGISTRY]
    }

    return CAPABILITY_REGISTRY.filter((entry) => {
      if (!entry.modes.includes(deploymentMode)) return false
      if (entry.minPlan && PLAN_RANK[plan] < PLAN_RANK[entry.minPlan]) return false
      return true
    })
  }, [deploymentMode, internalWorkspace, plan, selfHosted])

  const capabilityIds = useMemo(
    () => new Set(capabilities.map((c) => c.id)),
    [capabilities]
  )

  const hasCapability = (id: Capability): boolean => capabilityIds.has(id)

  const moduleVisible = (module: string): boolean =>
    capabilities.some((c) => c.module === module)

  return {
    capabilities,
    hasCapability,
    deploymentMode,
    plan,
    moduleVisible,
  }
}
