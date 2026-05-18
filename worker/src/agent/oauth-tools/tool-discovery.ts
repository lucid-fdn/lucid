/**
 * Tool Discovery — Dynamic tool definitions from Nango
 *
 * Uses the Nango SDK's `getScriptsConfig()` to discover available actions
 * per integration. The full response is cached in-memory with a 5min TTL
 * to avoid repeated API calls within a run.
 *
 * This replaces hardcoded catalogs — adding a new integration requires
 * ZERO code changes. Configure it in Nango, bind it to an assistant,
 * and the tools appear automatically.
 */

import type { NangoToolDefinition } from './types.js'
import { getNangoClient } from './nango-client.js'
import { captureError } from '../../monitoring/sentry.js'

// ---------------------------------------------------------------------------
// Cache — stores the FULL scripts config, not per-integration
// ---------------------------------------------------------------------------

interface FullCacheEntry {
  integrations: Map<string, NangoToolDefinition[]>
  expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let _fullCache: FullCacheEntry | null = null
/** Promise dedup: prevents thundering herd when cache expires under load */
let _pendingFetch: Promise<Map<string, NangoToolDefinition[]>> | null = null

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Discover available tools for one or more Nango integrations.
 * Fetches once per cache window, extracts per-integration.
 *
 * Uses the Nango SDK's `getScriptsConfig()` which returns all configured
 * actions with input schemas and descriptions.
 */
export async function discoverTools(integrationId: string): Promise<NangoToolDefinition[]> {
  const integrations = await getFullDiscoveryCache()
  return integrations.get(integrationId) ?? []
}

/**
 * Discover tools for multiple integrations in a single fetch.
 * More efficient than calling discoverTools() per integration —
 * avoids N cache-miss checks for N bindings.
 */
export async function discoverToolsBatch(
  integrationIds: string[],
): Promise<Map<string, NangoToolDefinition[]>> {
  const integrations = await getFullDiscoveryCache()
  const result = new Map<string, NangoToolDefinition[]>()
  for (const id of integrationIds) {
    result.set(id, integrations.get(id) ?? [])
  }
  return result
}

/**
 * Clear the discovery cache (e.g. on config change or test teardown).
 */
export function clearDiscoveryCache(): void {
  _fullCache = null
  _pendingFetch = null
}

// ---------------------------------------------------------------------------
// Internal — single fetch, full cache
// ---------------------------------------------------------------------------

async function getFullDiscoveryCache(): Promise<Map<string, NangoToolDefinition[]>> {
  // Return cached if fresh
  if (_fullCache && _fullCache.expiresAt > Date.now()) {
    return _fullCache.integrations
  }

  // Promise dedup: if a fetch is already in flight, join it instead of firing another
  if (_pendingFetch) return _pendingFetch

  _pendingFetch = fetchAndCacheConfig()
  try {
    return await _pendingFetch
  } finally {
    _pendingFetch = null
  }
}

async function fetchAndCacheConfig(): Promise<Map<string, NangoToolDefinition[]>> {
  const nango = getNangoClient()
  if (!nango) return new Map()

  try {
    // Use SDK method — handles auth headers, host, error formatting
    const configs = await nango.getScriptsConfig()

    const integrations = new Map<string, NangoToolDefinition[]>()

    // getScriptsConfig() returns StandardNangoConfig[] (array of integrations)
    if (Array.isArray(configs)) {
      for (const config of configs) {
        const integrationId = (config as any).providerConfigKey ?? (config as any).unique_key
        if (!integrationId) continue

        const actions = (config as any).actions ?? []
        const tools: NangoToolDefinition[] = actions.map((action: any) => ({
          actionName: action.name,
          description: action.description || `Execute ${action.name}`,
          inputSchema: buildInputSchema(action),
        }))

        if (tools.length > 0) {
          integrations.set(integrationId, tools)
        }
      }
    }

    _fullCache = { integrations, expiresAt: Date.now() + CACHE_TTL_MS }

    const totalActions = Array.from(integrations.values()).reduce((sum, t) => sum + t.length, 0)
    console.log(`[tool-discovery] Cached ${integrations.size} integrations (${totalActions} total actions)`)

    return integrations
  } catch (err) {
    captureError(err, { channel: 'tool-discovery' })
    // Return stale cache on error (graceful degradation)
    return _fullCache?.integrations ?? new Map()
  }
}

// ---------------------------------------------------------------------------
// Schema Builder
// ---------------------------------------------------------------------------

/**
 * Build a JSON Schema from Nango's action input definition.
 * Nango returns field definitions with name, type, and optional description.
 * We convert to standard JSON Schema for LLM tool calling.
 */
function buildInputSchema(action: {
  input?: { fields: Array<{ name: string; type: string; description?: string; optional?: boolean }> }
  models?: Array<{ name: string; fields: Array<{ name: string; type: string; description?: string; optional?: boolean }> }>
}): Record<string, unknown> {
  const fields = action.input?.fields
  if (!fields || fields.length === 0) {
    return { type: 'object', properties: {}, additionalProperties: false }
  }

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

/** Map Nango field types to JSON Schema types. */
function mapNangoType(nangoType: string): string {
  const lower = nangoType.toLowerCase()
  if (lower === 'string' || lower === 'date') return 'string'
  if (lower === 'number' || lower === 'integer' || lower === 'float') return 'number'
  if (lower === 'boolean' || lower === 'bool') return 'boolean'
  if (lower.endsWith('[]') || lower === 'array') return 'array'
  if (lower === 'object' || lower === 'json') return 'object'
  return 'string' // safe fallback
}
