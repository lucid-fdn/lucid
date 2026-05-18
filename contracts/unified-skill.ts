/**
 * Unified Skills UI — Wire Types
 *
 * Normalizes plugins, integrations, platform tools, and playbooks
 * into a single format for the unified Skills tab.
 *
 * Pure TypeScript — no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 */

import type { PluginToolDef } from './plugin'

// =============================================================================
// SECTION ASSIGNMENT
// =============================================================================

/** @deprecated Sections are no longer used in the UI. Kept for backwards compat. */
export type UnifiedSkillSection = 'core' | 'connected' | 'installed'

/**
 * Assign a UI section based on the item's kind and source.
 * Platform tools are filtered out before reaching the UI.
 * Integrations and plugins both map to 'installed' (flat list).
 */
export function assignSection(
  kind: string | undefined | null,
  source: string | undefined | null,
): UnifiedSkillSection {
  if (kind === 'platform' || source === 'built-in') return 'core'
  if (kind === 'integration') return 'connected'
  return 'installed'
}

/**
 * Whether an item should be visible in the Skills UI.
 * Excludes platform tools (always-on, non-configurable).
 */
export function isUserFacing(item: { section: UnifiedSkillSection }): boolean {
  return item.section !== 'core'
}

// =============================================================================
// UNIFIED SKILL ITEM
// =============================================================================

export interface UnifiedSkillItem {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  item_type?: 'plugin' | 'skill'

  /** UI section grouping */
  section: UnifiedSkillSection

  /** State */
  installed: boolean
  is_active: boolean
  installation_id: string | null
  activation_id: string | null

  /** Tools */
  tools: PluginToolDef[] | null
  enabled_tools: string[] | null
  tool_count: number

  /** Capability badges */
  can_act: boolean
  always_on: boolean
  removable: boolean

  /** Connection (only for connected skills) */
  connection_status: 'connected' | 'setup_required' | null
  auth_provider: string | null
  connection_id: string | null
  connection_row_id?: string | null
  connection_account_label?: string | null
  selected_connection_row_id?: string | null
  connection_count?: number
  connection_options?: Array<{
    id: string
    connection_id: string
    account_label: string | null
    account_id: string | null
    status: 'active' | 'expired' | 'revoked' | 'error'
  }>

  /** Integration health (only for connected skills with active connections) */
  health_status: 'healthy' | 'expiring' | 'expired' | 'error' | null
  health_message: string | null
  expires_at: string | null

  /** Skill content size (chars) */
  content_chars: number | null

  /** Metadata */
  version: string
  author: string | null
  source: string
  verified: boolean
  min_plan?: string
  source_type?: 'internal' | 'mcpgate' | 'imported' | null
  support_level?: 'native' | 'portable' | 'adapted' | 'experimental' | 'unsupported' | null
  supported_engines?: string[]
  runtime_flavors?: string[]
  channel_ownership?: string[]
  capability_tier?: 'metadata_only' | 'tool_backed' | 'runtime_extended' | null
  trust_tier?: 'lucid_first_party' | 'verified_partner' | 'community' | 'private_org' | null
  warm_state?: 'embedded' | 'installed' | 'remote_only' | null
  update_available?: {
    installed_version: number
    catalog_version: number
    changelog: string | null
  } | null
}

// =============================================================================
// WRITE TOOL NAMES (shared between API + UI for consistent badges)
// =============================================================================

/** Tools that perform mutations (swap, transfer, trade, schedule, message). */
export const WRITE_TOOL_NAMES = new Set([
  'wallet_transfer', 'dex_swap', 'hl_place_order', 'hl_cancel_order',
  'polymarket_trade', 'polymarket_automation', 'cron_schedule', 'cron_cancel',
  'sessions_send', 'sessions_spawn',
])

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Check if an item is a core (always-on platform) skill. */
export function isCoreSkill(item: UnifiedSkillItem): boolean {
  return item.section === 'core'
}
