/**
 * Shared Access Control Types and Constants
 * Can be imported by both client and server code
 */

// ============================================================================
// TYPES
// ============================================================================

export type WorkspacePlan = 'starter' | 'pro' | 'business'
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'

/** Numeric rank for plan comparison. Higher = more features. */
export const PLAN_RANK: Record<WorkspacePlan, number> = { starter: 0, pro: 1, business: 2 }

/**
 * Normalize plan names from Lucid Cloud/control-plane, Stripe metadata, and
 * legacy local Supabase rows into the product tiers the app understands.
 */
export function normalizeWorkspacePlanName(planName?: string | null): WorkspacePlan {
  if (!planName) return 'starter'
  const lower = planName.toLowerCase()
  if (
    lower.includes('business') ||
    lower.includes('enterprise') ||
    lower.includes('growth') ||
    lower.includes('internal')
  ) {
    return 'business'
  }
  if (lower.includes('pro')) return 'pro'
  return 'starter'
}

/** Returns true if `currentPlan` meets or exceeds `requiredPlan`. */
export function meetsMinPlan(currentPlan: WorkspacePlan, requiredPlan: WorkspacePlan): boolean {
  return (PLAN_RANK[currentPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0)
}

export interface PlanLimits {
  // Team limits
  maxMembers: number
  maxProjects: number
  maxEnvironments: number
  maxWorkspaces: number
  
  // Feature access
  advancedAnalytics: boolean
  customBranding: boolean
  prioritySupport: boolean
  ssoEnabled: boolean
  apiAccess: boolean
  webhooks: boolean
  
  // Resource limits
  storageGB: number
  apiCallsPerMonth: number
  
  // Collaboration
  guestAccess: boolean
  externalSharing: boolean

  // Gateway Keys
  gatewayKeysEnabled: boolean
  maxGatewayKeys: number
  gatewayKeyCustomLimits: boolean
  gatewayKeyBudgets: boolean
  gatewayKeyRotation: boolean
  gatewayKeyAudit: boolean
  gatewayKeyTemplates: boolean
  gatewayMaxModels: number

  // BYOK + Managed Inference
  gatewayKeyBYOK: boolean
  gatewayKeyManagedInference: boolean

  // Video Studio
  videoEnabled: boolean
  videoRendersPerMonth: number

  // Plugins
  pluginsEnabled: boolean
  maxPluginsPerAssistant: number
  maxPluginToolsTotal: number

  // Runtime & Engine
  runtimeDedicatedEnabled: boolean
  runtimeByoEnabled: boolean
  runtimeNativeChannels: boolean
  runtimeAdvancedControls: boolean
  runtimeNetworkControls: boolean
  runtimeCustomLimits: boolean
  runtimeMaintenance: boolean
  runtimeFullAutoUpdates: boolean
}

export interface RuntimeFeatureAccess {
  canUseDedicatedRuntime: boolean
  canUseByoRuntime: boolean
  canUseNativeChannels: boolean
  canUseAdvancedControls: boolean
  canUseNetworkControls: boolean
  canUseCustomLimits: boolean
  canUseMaintenance: boolean
  canUseFullAutoUpdates: boolean
  upgradePlan: WorkspacePlan | null
}

export interface RolePermissions {
  // Workspace management
  manageWorkspace: boolean
  deleteWorkspace: boolean
  
  // Member management
  inviteMembers: boolean
  removeMembers: boolean
  changeRoles: boolean
  
  // Content management
  createProjects: boolean
  editProjects: boolean
  deleteProjects: boolean
  
  // Billing
  manageBilling: boolean
  viewBilling: boolean
  
  // Settings
  manageSettings: boolean
  viewSettings: boolean
  
  // Data access
  viewAnalytics: boolean
  exportData: boolean
}

// ============================================================================
// PLAN DEFAULTS (Fallback only — DB `plans` table is the source of truth)
// Used when subscription data is unavailable (no subscription, DB down, etc.)
// To change plan features/limits, update the `plans` table in Supabase.
// ============================================================================

export const PLAN_DEFAULTS: Record<WorkspacePlan, PlanLimits> = {
  starter: {
    maxMembers: 3,
    maxProjects: 5,
    maxEnvironments: 2,
    maxWorkspaces: 3,
    advancedAnalytics: false,
    customBranding: false,
    prioritySupport: false,
    ssoEnabled: false,
    apiAccess: false,
    webhooks: false,
    storageGB: 5,
    apiCallsPerMonth: 1000,
    guestAccess: false,
    externalSharing: false,
    gatewayKeysEnabled: true,
    maxGatewayKeys: 5,
    gatewayKeyCustomLimits: false,
    gatewayKeyBudgets: false,
    gatewayKeyRotation: false,
    gatewayKeyAudit: false,
    gatewayKeyTemplates: false,
    gatewayMaxModels: 20,
    gatewayKeyBYOK: true,
    gatewayKeyManagedInference: false,
    videoEnabled: false,
    videoRendersPerMonth: 0,
    pluginsEnabled: true,
    maxPluginsPerAssistant: 2,
    maxPluginToolsTotal: 10,
    runtimeDedicatedEnabled: false,
    runtimeByoEnabled: false,
    runtimeNativeChannels: false,
    runtimeAdvancedControls: false,
    runtimeNetworkControls: false,
    runtimeCustomLimits: false,
    runtimeMaintenance: false,
    runtimeFullAutoUpdates: false,
  },
  pro: {

    maxMembers: 25,
    maxProjects: 50,
    maxEnvironments: 10,
    maxWorkspaces: 10,
    advancedAnalytics: true,
    customBranding: true,
    prioritySupport: true,
    ssoEnabled: false,
    apiAccess: true,
    webhooks: true,
    storageGB: 100,
    apiCallsPerMonth: 50000,
    guestAccess: true,
    externalSharing: true,
    gatewayKeysEnabled: true,
    maxGatewayKeys: 25,
    gatewayKeyCustomLimits: true,
    gatewayKeyBudgets: true,
    gatewayKeyRotation: false,
    gatewayKeyAudit: true,
    gatewayKeyTemplates: true,
    gatewayMaxModels: Infinity,
    gatewayKeyBYOK: true,
    gatewayKeyManagedInference: true,
    videoEnabled: false,
    videoRendersPerMonth: 0,
    pluginsEnabled: true,
    maxPluginsPerAssistant: 10,
    maxPluginToolsTotal: 50,
    runtimeDedicatedEnabled: true,
    runtimeByoEnabled: false,
    runtimeNativeChannels: false,
    runtimeAdvancedControls: true,
    runtimeNetworkControls: false,
    runtimeCustomLimits: true,
    runtimeMaintenance: true,
    runtimeFullAutoUpdates: false,
  },
  business: {
    maxMembers: Infinity,
    maxProjects: Infinity,
    maxEnvironments: Infinity,
    maxWorkspaces: Infinity,
    advancedAnalytics: true,
    customBranding: true,
    prioritySupport: true,
    ssoEnabled: true,
    apiAccess: true,
    webhooks: true,
    storageGB: Infinity,
    apiCallsPerMonth: Infinity,
    guestAccess: true,
    externalSharing: true,
    gatewayKeysEnabled: true,
    maxGatewayKeys: Infinity,
    gatewayKeyCustomLimits: true,
    gatewayKeyBudgets: true,
    gatewayKeyRotation: true,
    gatewayKeyAudit: true,
    gatewayKeyTemplates: true,
    gatewayMaxModels: Infinity,
    gatewayKeyBYOK: true,
    gatewayKeyManagedInference: true,
    videoEnabled: false,
    videoRendersPerMonth: 0,
    pluginsEnabled: true,
    maxPluginsPerAssistant: Infinity,
    maxPluginToolsTotal: Infinity,
    runtimeDedicatedEnabled: true,
    runtimeByoEnabled: true,
    runtimeNativeChannels: true,
    runtimeAdvancedControls: true,
    runtimeNetworkControls: true,
    runtimeCustomLimits: true,
    runtimeMaintenance: true,
    runtimeFullAutoUpdates: true,
  },
}

/**
 * Build PlanLimits from DB subscription, falling back to static defaults.
 * DB is the source of truth — static defaults are only used when DB data is missing.
 */
export function resolvePlanLimits(
  planName: WorkspacePlan,
  dbFeatures?: Record<string, boolean>,
  dbLimits?: Record<string, number>,
): PlanLimits {
  const defaults = PLAN_DEFAULTS[planName] || PLAN_DEFAULTS.starter

  if (!dbFeatures && !dbLimits) return defaults

  // DB keys use snake_case, PlanLimits uses camelCase
  const keyMap: Record<string, keyof PlanLimits> = {
    advanced_analytics: 'advancedAnalytics',
    custom_branding: 'customBranding',
    priority_support: 'prioritySupport',
    sso_enabled: 'ssoEnabled',
    api_access: 'apiAccess',
    guest_access: 'guestAccess',
    external_sharing: 'externalSharing',
    gateway_keys_enabled: 'gatewayKeysEnabled',
    gateway_key_custom_limits: 'gatewayKeyCustomLimits',
    gateway_key_budgets: 'gatewayKeyBudgets',
    gateway_key_rotation: 'gatewayKeyRotation',
    gateway_key_audit: 'gatewayKeyAudit',
    gateway_key_templates: 'gatewayKeyTemplates',
    gateway_key_byok: 'gatewayKeyBYOK',
    gateway_key_managed_inference: 'gatewayKeyManagedInference',
    video_enabled: 'videoEnabled',
    video_studio: 'videoEnabled',
    plugins_enabled: 'pluginsEnabled',
    max_plugins_per_assistant: 'maxPluginsPerAssistant',
    max_plugin_tools_total: 'maxPluginToolsTotal',
    runtime_dedicated_enabled: 'runtimeDedicatedEnabled',
    runtime_byo_enabled: 'runtimeByoEnabled',
    runtime_native_channels: 'runtimeNativeChannels',
    runtime_advanced_controls: 'runtimeAdvancedControls',
    runtime_network_controls: 'runtimeNetworkControls',
    runtime_custom_limits: 'runtimeCustomLimits',
    runtime_maintenance: 'runtimeMaintenance',
    runtime_full_auto_updates: 'runtimeFullAutoUpdates',
    max_members: 'maxMembers',
    max_projects: 'maxProjects',
    max_environments: 'maxEnvironments',
    max_workspaces: 'maxWorkspaces',
    storage_gb: 'storageGB',
    api_calls_per_month: 'apiCallsPerMonth',
    max_gateway_keys: 'maxGatewayKeys',
    gateway_max_models: 'gatewayMaxModels',
    video_renders_per_month: 'videoRendersPerMonth',
  }

  const merged = { ...defaults }

  // Apply DB features (booleans)
  if (dbFeatures) {
    for (const [dbKey, value] of Object.entries(dbFeatures)) {
      const field = keyMap[dbKey] || (dbKey as keyof PlanLimits)
      if (field in merged && typeof value === 'boolean') {
        ;(merged as Record<string, unknown>)[field] = value
      }
    }
  }

  // Apply DB limits (numbers)
  if (dbLimits) {
    for (const [dbKey, value] of Object.entries(dbLimits)) {
      const field = keyMap[dbKey] || (dbKey as keyof PlanLimits)
      if (field in merged && typeof value === 'number') {
        ;(merged as Record<string, unknown>)[field] = value === -1 ? Infinity : value
      }
    }
  }

  return merged
}

export function getRuntimeFeatureAccessFromLimits(limits: PlanLimits): RuntimeFeatureAccess {
  const canUseDedicatedRuntime = Boolean(limits.runtimeDedicatedEnabled)
  const canUseByoRuntime = Boolean(limits.runtimeByoEnabled)
  const canUseNativeChannels = Boolean(limits.runtimeNativeChannels)
  return {
    canUseDedicatedRuntime,
    canUseByoRuntime,
    canUseNativeChannels,
    canUseAdvancedControls: Boolean(limits.runtimeAdvancedControls),
    canUseNetworkControls: Boolean(limits.runtimeNetworkControls),
    canUseCustomLimits: Boolean(limits.runtimeCustomLimits),
    canUseMaintenance: Boolean(limits.runtimeMaintenance),
    canUseFullAutoUpdates: Boolean(limits.runtimeFullAutoUpdates),
    upgradePlan: !canUseDedicatedRuntime
      ? 'pro'
      : !canUseByoRuntime || !canUseNativeChannels
        ? 'business'
        : null,
  }
}

/** @deprecated Use PLAN_DEFAULTS — kept as alias during migration */
export const PLAN_LIMITS = PLAN_DEFAULTS

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export const ROLE_PERMISSIONS: Record<WorkspaceRole, RolePermissions> = {
  owner: {
    manageWorkspace: true,
    deleteWorkspace: true,
    inviteMembers: true,
    removeMembers: true,
    changeRoles: true,
    createProjects: true,
    editProjects: true,
    deleteProjects: true,
    manageBilling: true,
    viewBilling: true,
    manageSettings: true,
    viewSettings: true,
    viewAnalytics: true,
    exportData: true,
  },
  admin: {
    manageWorkspace: true,
    deleteWorkspace: false,
    inviteMembers: true,
    removeMembers: true,
    changeRoles: true,
    createProjects: true,
    editProjects: true,
    deleteProjects: true,
    manageBilling: false,
    viewBilling: true,
    manageSettings: true,
    viewSettings: true,
    viewAnalytics: true,
    exportData: true,
  },
  member: {
    manageWorkspace: false,
    deleteWorkspace: false,
    inviteMembers: false,
    removeMembers: false,
    changeRoles: false,
    createProjects: true,
    editProjects: true,
    deleteProjects: false,
    manageBilling: false,
    viewBilling: false,
    manageSettings: false,
    viewSettings: true,
    viewAnalytics: true,
    exportData: true,
  },
  guest: {
    manageWorkspace: false,
    deleteWorkspace: false,
    inviteMembers: false,
    removeMembers: false,
    changeRoles: false,
    createProjects: false,
    editProjects: false,
    deleteProjects: false,
    manageBilling: false,
    viewBilling: false,
    manageSettings: false,
    viewSettings: true,
    viewAnalytics: false,
    exportData: false,
  },
}
