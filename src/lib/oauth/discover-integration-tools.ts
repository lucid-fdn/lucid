import 'server-only'

import { nangoFetch } from './nango-fetch'
import type { PluginToolDef } from '@contracts/plugin'
import { prepareToolManifest } from '@lucid/plugin-policy'
import { ErrorService } from '@/lib/errors/error-service'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NANGO_HOST = process.env.NANGO_HOST || process.env.NEXT_PUBLIC_OAUTH_API_URL || 'https://api.nango.dev'
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY

// ---------------------------------------------------------------------------
// Shared provider disambiguation
// ---------------------------------------------------------------------------

/**
 * When multiple Nango configs share a provider (e.g. google-sheets + google-calendar
 * both use provider "google"), Nango merges their actions under one providerConfigKey.
 * These maps let us find the parent config and filter to only relevant actions.
 */
const SHARED_PROVIDER_MAP: Record<string, string> = {
  'google-calendar': 'google',
  'google-sheets': 'google',
}

/** Action name prefixes that belong to each config key (only needed for shared providers) */
const ACTION_FILTER_MAP: Record<string, string[]> = {
  'google-sheets': ['list-spreadsheets', 'get-sheet-data', 'append-rows', 'update-cells'],
  'google-calendar': ['list-events', 'create-event', 'list-calendars'],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NangoActionField {
  name: string
  type: string
  description?: string
  optional?: boolean
}

/**
 * Nango's /scripts/config returns action schemas in two possible shapes:
 *
 * 1. Legacy: `input.fields[]` — used by older `.nango/schema.ts`-style scripts
 * 2. Modern (what our server returns): `input` is a STRING pointing to a
 *    definition name inside `json_schema.definitions[<name>]`, which is a
 *    full JSON Schema object with `properties` + `required`.
 *
 * We try the modern shape first (full JSON Schema including nested objects,
 * required fields, descriptions), then fall back to the legacy flat fields.
 */
interface NangoJsonSchemaDef {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
  description?: string
}

interface NangoAction {
  name: string
  description?: string
  input?: string | { fields: NangoActionField[] }
  json_schema?: {
    definitions?: Record<string, NangoJsonSchemaDef>
  }
}

interface NangoScriptConfig {
  providerConfigKey?: string
  unique_key?: string
  actions?: NangoAction[]
}

export interface DiscoveryResult {
  ok: boolean
  tools: PluginToolDef[]
  /** ISO timestamp of discovery */
  discovered_at: string
  /** Nango provider key used */
  provider: string
  /** Number of actions found */
  action_count: number
  /** Error message if discovery failed */
  error?: string
}

// ---------------------------------------------------------------------------
// Nango type → JSON Schema type
// ---------------------------------------------------------------------------

function mapNangoType(nangoType: string): string {
  const lower = nangoType.toLowerCase()
  if (lower === 'string' || lower === 'date') return 'string'
  if (lower === 'number' || lower === 'integer' || lower === 'float') return 'number'
  if (lower === 'boolean' || lower === 'bool') return 'boolean'
  if (lower.endsWith('[]') || lower === 'array') return 'array'
  if (lower === 'object' || lower === 'json') return 'object'
  return 'string'
}

// ---------------------------------------------------------------------------
// Build JSON Schema from Nango action input definition
// ---------------------------------------------------------------------------

function buildParameters(action: NangoAction): Record<string, unknown> {
  // Path 1 (modern): input is a definition name → look up full JSON Schema
  // in json_schema.definitions. This is what our self-hosted Nango returns.
  if (typeof action.input === 'string' && action.json_schema?.definitions) {
    const def = action.json_schema.definitions[action.input]
    if (def && def.type === 'object' && def.properties) {
      return {
        type: 'object',
        properties: def.properties,
        ...(def.required && def.required.length > 0 ? { required: def.required } : {}),
        additionalProperties: false,
      }
    }
  }

  // Path 2 (legacy): input.fields[] — flat list of typed fields
  const fields =
    typeof action.input === 'object' && action.input !== null && 'fields' in action.input
      ? action.input.fields
      : undefined

  if (fields && fields.length > 0) {
    const properties: Record<string, Record<string, unknown>> = {}
    const required: string[] = []

    for (const field of fields) {
      properties[field.name] = {
        type: mapNangoType(field.type),
        ...(field.description ? { description: field.description } : {}),
      }
      if (!field.optional) {
        required.push(field.name)
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    }
  }

  // No schema available — return an open object so the agent can still pass
  // args inferred from tool description (previous behavior would have blocked).
  return { type: 'object', properties: {}, additionalProperties: false }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover available tools for a Nango integration.
 *
 * Calls Nango's `/scripts/config` REST endpoint (same as the SDK's
 * `getScriptsConfig()`), filters to the requested provider, and maps
 * actions to `PluginToolDef[]` format for `manifest_snapshot`.
 *
 * Returns a structured result with tools + metadata for audit/debugging.
 * Callers decide whether to fail or proceed on `ok: false`.
 */
export async function discoverIntegrationTools(
  providerConfigKey: string,
): Promise<DiscoveryResult> {
  const base = { provider: providerConfigKey, discovered_at: new Date().toISOString() }

  if (!NANGO_SECRET_KEY) {
    return { ...base, ok: false, tools: [], action_count: 0, error: 'NANGO_SECRET_KEY not configured' }
  }

  try {
    const result = await nangoFetch<NangoScriptConfig[]>({
      url: `${NANGO_HOST}/scripts/config`,
      method: 'GET',
      headers: { Authorization: `Bearer ${NANGO_SECRET_KEY}` },
      label: `discover-${providerConfigKey}`,
      maxRetries: 2,
      timeoutMs: 10_000,
    })

    if (!result.ok || !Array.isArray(result.data)) {
      return { ...base, ok: false, tools: [], action_count: 0, error: `OAuth provider API returned ${result.status}` }
    }

    // Find config by providerConfigKey match.
    // For providers shared across multiple configs (e.g. google → google-sheets + google-calendar),
    // Nango merges actions under one providerConfigKey. Fall back to matching any config
    // with the same underlying provider and filter actions by the ACTION_FILTER_MAP.
    let config = result.data.find(
      (c) => (c.providerConfigKey ?? c.unique_key) === providerConfigKey,
    )

    // Fallback: find any config that shares the same base provider
    if (!config?.actions?.length) {
      const providerBase = SHARED_PROVIDER_MAP[providerConfigKey]
      if (providerBase) {
        config = result.data.find(
          (c) => (c.providerConfigKey ?? c.unique_key)?.startsWith(providerBase) && (c.actions?.length ?? 0) > 0,
        )
      }
    }

    if (!config?.actions?.length) {
      return { ...base, ok: false, tools: [], action_count: 0, error: `No actions found for provider "${providerConfigKey}"` }
    }

    // Filter actions if multiple configs share a provider (e.g. google-sheets vs google-calendar)
    const actionFilter = ACTION_FILTER_MAP[providerConfigKey]
    const filteredActions = actionFilter
      ? config.actions.filter((a) => actionFilter.some((prefix) => a.name.startsWith(prefix)))
      : config.actions

    if (filteredActions.length === 0) {
      return { ...base, ok: false, tools: [], action_count: 0, error: `No matching actions for "${providerConfigKey}" after filtering` }
    }

    const rawTools = filteredActions.map((action) => ({
      name: action.name,
      description: action.description || `Execute ${action.name}`,
      parameters: buildParameters(action),
    }))

    const prepared = prepareToolManifest(rawTools, { dropInvalidTools: true })

    if (prepared.issues.length > 0) {
      ErrorService.captureMessage('Discovered integration manifest required normalization', {
        severity: prepared.metadata.hasErrors ? 'warning' : 'info',
        context: {
          providerConfigKey,
          issueCount: prepared.issues.length,
          invalidToolCount: prepared.metadata.invalidToolCount,
          manifestHash: prepared.metadata.manifestHash,
        },
        tags: { layer: 'oauth', route: 'discover-integration-tools' },
      })
    }

    if (prepared.metadata.hasErrors) {
      return {
        ...base,
        ok: false,
        tools: prepared.tools as PluginToolDef[],
        action_count: prepared.tools.length,
        error: `Discovered invalid tool schemas for provider "${providerConfigKey}"`,
      }
    }

    return { ...base, ok: true, tools: prepared.tools as PluginToolDef[], action_count: prepared.tools.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ErrorService.captureException(err instanceof Error ? err : new Error(message), {
      severity: 'warning',
      context: { providerConfigKey },
      tags: { layer: 'oauth', route: 'discover-integration-tools' },
    })
    return { ...base, ok: false, tools: [], action_count: 0, error: message }
  }
}
