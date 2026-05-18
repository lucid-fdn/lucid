import {
  defaultAgentCommerceNativeRailAdapters,
  nativeRailIdFromString,
} from './adapters'
import type {
  AgentCommerceNativeRailAdapter,
  AgentCommerceNativeRailId,
  AgentCommerceNativeRailManifest,
  AgentCommerceNativeRailPlanInput,
  AgentCommerceNativeRailPlanResult,
} from './types'

const adapters = new Map<AgentCommerceNativeRailId, AgentCommerceNativeRailAdapter>()

export function registerAgentCommerceNativeRailAdapter(adapter: AgentCommerceNativeRailAdapter): void {
  if (adapters.has(adapter.manifest.id)) {
    throw new Error(`Duplicate Agent Commerce native rail adapter id registered: ${adapter.manifest.id}`)
  }
  adapters.set(adapter.manifest.id, adapter)
}

export function resetAgentCommerceNativeRailAdapters(): void {
  adapters.clear()
}

export function registerDefaultAgentCommerceNativeRailAdapters(): void {
  if (adapters.size > 0) return
  for (const adapter of defaultAgentCommerceNativeRailAdapters()) {
    registerAgentCommerceNativeRailAdapter(adapter)
  }
}

export function getAgentCommerceNativeRailAdapter(
  id: AgentCommerceNativeRailId | string,
): AgentCommerceNativeRailAdapter | null {
  registerDefaultAgentCommerceNativeRailAdapters()
  const parsed = nativeRailIdFromString(id)
  return parsed ? adapters.get(parsed) ?? null : null
}

export function listAgentCommerceNativeRailAdapters(): AgentCommerceNativeRailAdapter[] {
  registerDefaultAgentCommerceNativeRailAdapters()
  return [...adapters.values()]
}

export function listAgentCommerceNativeRailManifests(): AgentCommerceNativeRailManifest[] {
  return listAgentCommerceNativeRailAdapters().map((adapter) => adapter.manifest)
}

export function planAgentCommerceNativeRails(
  input: AgentCommerceNativeRailPlanInput,
): AgentCommerceNativeRailPlanResult[] {
  return listAgentCommerceNativeRailAdapters()
    .filter((adapter) => adapter.canPlan(input))
    .map((adapter) => adapter.plan(input))
    .sort(compareNativeRailPlans)
}

export function selectAgentCommerceNativeRailPlan(
  input: AgentCommerceNativeRailPlanInput,
): AgentCommerceNativeRailPlanResult | null {
  return planAgentCommerceNativeRails(input)[0] ?? null
}

function compareNativeRailPlans(
  a: AgentCommerceNativeRailPlanResult,
  b: AgentCommerceNativeRailPlanResult,
): number {
  if (a.executable !== b.executable) return a.executable ? -1 : 1
  return railPriority(a.railId) - railPriority(b.railId)
}

function railPriority(railId: AgentCommerceNativeRailId): number {
  switch (railId) {
    case 'lucid_sandbox_native':
      return 0
    case 'rye_checkout':
      return 1
    case 'shopify_storefront':
      return 2
    case 'kroger_cart':
      return 3
    case 'walgreens_add_to_cart':
      return 4
  }
}
