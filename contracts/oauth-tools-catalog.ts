/**
 * OAuth Tools Catalog — Types & Helpers
 *
 * Types for the OAuth action catalog. Catalog data is stored in the
 * `oauth_action_catalog` DB table and discovered dynamically from Nango
 * at runtime. No hardcoded action definitions.
 *
 * UI fetches catalog from: GET /api/oauth-tools/catalog (reads DB)
 * Worker discovers tools from: Nango /scripts/config (dynamic)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionDangerLevel = 'read' | 'write' | 'destructive'

export interface CatalogAction {
  /** Action name (e.g. 'send_message') */
  name: string
  /** Human-readable description for the LLM and UI */
  description: string
  /** Safety classification */
  dangerLevel: ActionDangerLevel
  /** JSON Schema for parameter validation */
  parameterSchema: Record<string, unknown>
  /** Whether the action is safe to retry on transient failure */
  idempotent: boolean
  /** Whether the action only reads data (no side effects) */
  readOnly: boolean
}

export interface CatalogProvider {
  /** Provider ID (e.g. 'slack') */
  id: string
  /** Human-readable name */
  displayName: string
  /** Actions available for this provider */
  actions: CatalogAction[]
}

// ---------------------------------------------------------------------------
// DB Row → CatalogProvider transformer
// ---------------------------------------------------------------------------

/** Row shape returned by get_oauth_action_catalog() RPC */
export interface OAuthCatalogRow {
  provider: string
  provider_display_name: string
  action_name: string
  description: string
  parameter_schema: Record<string, unknown>
  danger_level: ActionDangerLevel
  idempotent: boolean
  read_only: boolean
}

/**
 * Transform flat DB rows into grouped CatalogProvider[] for the UI.
 * Groups by provider, preserving row order (sort_order from DB).
 */
export function rowsToCatalogProviders(rows: OAuthCatalogRow[]): CatalogProvider[] {
  const providerMap = new Map<string, CatalogProvider>()

  for (const row of rows) {
    let provider = providerMap.get(row.provider)
    if (!provider) {
      provider = {
        id: row.provider,
        displayName: row.provider_display_name,
        actions: [],
      }
      providerMap.set(row.provider, provider)
    }
    provider.actions.push({
      name: row.action_name,
      description: row.description,
      dangerLevel: row.danger_level,
      parameterSchema: row.parameter_schema,
      idempotent: row.idempotent,
      readOnly: row.read_only,
    })
  }

  return Array.from(providerMap.values())
}
