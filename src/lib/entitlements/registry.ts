/**
 * Entitlement Presentation Registry (client-safe)
 *
 * Maps metric names to display metadata (icons, labels, context hints).
 * This is presentation-only — all limits, plans, and decisions come from the backend.
 */

/** Rendering context hint for the frontend */
export type EntitlementContext = 'chat' | 'modal' | 'inline' | 'toast'

export interface EntitlementDisplayMeta {
  icon: string
  label: string
  contextHint: EntitlementContext
}

/**
 * Presentation metadata keyed by metric name.
 * The backend is the source of truth for values — this only provides UI hints.
 */
export const ENTITLEMENT_DISPLAY: Record<string, EntitlementDisplayMeta> = {
  // Quotas
  ai_queries_monthly: { icon: 'MessageSquare', label: 'AI Queries', contextHint: 'chat' },
  api_calls_monthly:  { icon: 'Code',          label: 'API Calls',  contextHint: 'toast' },

  // Capacities
  storage_gb:                { icon: 'HardDrive', label: 'Storage',              contextHint: 'inline' },
  max_members:               { icon: 'Users',     label: 'Team Members',         contextHint: 'modal' },
  max_projects:              { icon: 'FolderOpen', label: 'Projects',            contextHint: 'modal' },
  max_workspaces:            { icon: 'Building2',  label: 'Workspaces',          contextHint: 'modal' },
  max_plugins_per_assistant: { icon: 'Puzzle',     label: 'Plugins',             contextHint: 'inline' },
  max_plugin_tools_total:    { icon: 'Wrench',     label: 'Plugin Tools',        contextHint: 'inline' },
  max_gateway_keys:          { icon: 'Key',        label: 'Gateway Keys',        contextHint: 'inline' },
  gateway_key_custom_limits: { icon: 'Key',        label: 'Gateway Key Management', contextHint: 'modal' },

  // Features
  plugins_enabled: { icon: 'Puzzle',    label: 'Plugins',      contextHint: 'inline' },
  video_enabled:   { icon: 'Video',     label: 'Video Studio', contextHint: 'modal' },
  sso_enabled:     { icon: 'Shield',    label: 'SSO',          contextHint: 'modal' },
  api_access:      { icon: 'Code',      label: 'API Access',   contextHint: 'modal' },
  webhooks:        { icon: 'Webhook',   label: 'Webhooks',     contextHint: 'modal' },
}

/**
 * Get display metadata for a metric, with sensible defaults.
 */
export function getEntitlementDisplay(metric: string): EntitlementDisplayMeta {
  return ENTITLEMENT_DISPLAY[metric] || {
    icon: 'AlertCircle',
    label: metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    contextHint: 'toast' as EntitlementContext,
  }
}
