/**
 * PluginBridge — Plugin tool execution layer
 *
 * Routes plugin tool calls via plugin-policy router + plugin-executor executor:
 * - Trust-tier policy enforcement (internal/verified → embedded, community → gateway)
 * - Embedded execution via InMemoryTransport (~1-5ms) for first-party plugins
 * - HTTP execution via MCPGate gateway with retry + Retry-After support
 * - Explicit opt-in fallback from embedded → gateway (fallbackMode='gateway')
 */

import { ensureEmbeddedPlugin, isFirstPartyPlugin } from './embedded-plugin-loader.js'
import { callEmbeddedTool } from './embedded-registry.js'
import { withSpan, classifyError, type Span } from '../observability/tracing.js'
import { addBreadcrumb, captureError } from '../monitoring/sentry.js'

/** Tool execution context (NEVER exposed to model — executor only) */
export interface PluginToolContext {
  pluginSlug: string
  config: Record<string, unknown>

  // UCA dimensions (required at runtime — safe defaults applied at mapping boundary)
  trustLevel: 'internal' | 'verified' | 'community'
  executionMode: 'in_process' | 'gateway'
  transport: 'embedded' | 'remote-mcp' | 'rest' | 'nango'
  authType: 'none' | 'oauth2' | 'api-key' | 'env-var'
  authProvider: string | null

  // Credential resolution
  connectionId?: string      // org_integration_connections.connection_id

  // Routing targets (by transport type)
  mcpgateServerId?: string   // for remote-mcp
  endpointUrl?: string       // for rest

  // Nango integration context (only for transport: 'nango')
  nangoBinding?: import('./oauth-tools/types.js').OAuthBinding
  nangoRunId?: string
  nangoAssistantId?: string
  nangoRpcFn?: (name: string, params: Record<string, unknown>) => PromiseLike<{ error: unknown }>

  // Fallback: null = fail hard (default), 'gateway' = fall back to MCPGate
  fallbackMode?: 'gateway' | null

  /** @deprecated Use trustLevel + transport. */
  source?: 'first-party' | 'mcpgate' | 'community'
}

// ---------------------------------------------------------------------------
// Lazy-loaded capability pipeline + credential resolution
// ---------------------------------------------------------------------------

let _routePlugin: typeof import('@lucid/plugin-policy').routePlugin | null = null
let _ExecutorCtor: typeof import('@lucid/plugin-executor').UnifiedExecutor | null = null
let _cachedExecutor: import('@lucid/plugin-executor').UnifiedExecutor | null = null
let _cachedGatewayFingerprint: string | undefined

// Credential resolution (lazy-loaded — only initialized when first integration tool is called)
let _credentialAdapter: import('@lucid/integration-auth').CompositeAdapter | null = null
let _credentialCache: import('@lucid/integration-auth').CredentialCache | null = null

/** Lazy-load credential adapter + cache for integration auth. */
async function getCredentialResolver() {
  if (_credentialAdapter && _credentialCache) {
    return { adapter: _credentialAdapter, cache: _credentialCache }
  }

  const { CompositeAdapter, CredentialCache } = await import('@lucid/integration-auth')

  // Worker credential chain: Nango (OAuth) → EnvVar (API keys).
  // DB adapter not needed — credential_store lives in MCPGate's database, not LucidMerged's.
  // MCPGate resolves its own DB credentials when it receives gateway calls.
  _credentialAdapter = new CompositeAdapter({
    nango: process.env.NANGO_SERVER_URL && process.env.NANGO_SECRET_KEY
      ? { serverUrl: process.env.NANGO_SERVER_URL, secretKey: process.env.NANGO_SECRET_KEY }
      : undefined,
  })

  _credentialCache = new CredentialCache({ ttlMs: 5 * 60_000, maxEntries: 200 })

  return { adapter: _credentialAdapter, cache: _credentialCache }
}

/** Embedded adapter — stateless, safe to share across executor instances. */
const embeddedAdapter = {
  isEmbedded: isFirstPartyPlugin,
  ensureServer: ensureEmbeddedPlugin,
  callTool: async (slug: string, toolName: string, args: Record<string, unknown>) => {
    const result = await callEmbeddedTool(slug, toolName, args)
    return { content: result.content, isError: result.isError }
  },
}

/** Lazy-load capability packages + build executor (re-created if gateway env changes). */
async function getUnifiedPipeline() {
  if (!_routePlugin) {
    const [{ routePlugin }, { UnifiedExecutor }] = await Promise.all([
      import('@lucid/plugin-policy'),
      import('@lucid/plugin-executor'),
    ])
    _routePlugin = routePlugin
    _ExecutorCtor = UnifiedExecutor
  }

  // Re-create executor when gateway config changes (cheap — just constructor + 2 string reads)
  const mcpgateUrl = process.env.MCPGATE_URL
  const mcpgateKey = process.env.MCPGATE_API_KEY
  const fingerprint = `${mcpgateUrl}|${mcpgateKey}`

  if (!_cachedExecutor || _cachedGatewayFingerprint !== fingerprint) {
    _cachedExecutor = new _ExecutorCtor!({
      embedded: embeddedAdapter,
      gateway: mcpgateUrl && mcpgateKey
        ? { mcpgateUrl, mcpgateApiKey: mcpgateKey }
        : undefined,
    })
    _cachedGatewayFingerprint = fingerprint
  }

  return { executor: _cachedExecutor!, routePlugin: _routePlugin! }
}

/**
 * Execute a plugin tool.
 *
 * Uses plugin-policy router (trust-tier policy) + plugin-executor executor
 * (embedded for internal/verified, gateway for community, automatic fallback).
 */
export async function executePluginTool(
  pluginSlug: string,
  toolName: string,
  args: Record<string, unknown>,
  ctx: PluginToolContext,
): Promise<string> {
  // Nango integration: direct execution with policy enforcement
  // Bypasses plugin-policy/plugin-executor — Nango owns auth + API translation
  if (ctx.transport === 'nango' && ctx.nangoBinding) {
    if (!ctx.nangoRunId || !ctx.nangoAssistantId) {
      console.error(`[PluginBridge] Nango binding present but missing runId/assistantId for ${pluginSlug}:${toolName}`)
      return JSON.stringify({ error: 'Integration misconfigured: missing run context' })
    }
    const { executeNangoAction } = await import('./oauth-tools/nango-action-bridge.js')
    // Wire names convert hyphens to underscores (send-message → send_message).
    // Nango registers actions with original kebab-case names. Reverse the mapping.
    const nangoActionName = toolName.replace(/_/g, '-')
    return executeNangoAction(nangoActionName, args, {
      binding: ctx.nangoBinding,
      runId: ctx.nangoRunId,
      assistantId: ctx.nangoAssistantId,
      rpcFn: ctx.nangoRpcFn,
    })
  }

  return withSpan('plugin.execute', {
    'lucid.plugin.slug': pluginSlug,
    'lucid.plugin.tool': toolName,
  }, async (span: Span) => {
    try {
      const { executor, routePlugin } = await getUnifiedPipeline()

      // Build ActivatedPlugin from context — no derivation, use explicit fields
      // transport is narrowed: 'nango' is handled above and never reaches here
      const activatedPlugin = {
        slug: pluginSlug,
        name: pluginSlug,
        tools: [],
        config: ctx.config,
        kind: 'plugin' as const,
        trustLevel: ctx.trustLevel,
        executionMode: ctx.executionMode,
        transport: ctx.transport as 'embedded' | 'remote-mcp' | 'rest',
        authType: ctx.authType,
        authProvider: ctx.authProvider,
        mcpgateServerId: ctx.mcpgateServerId,
        endpointUrl: ctx.endpointUrl,
      }

      const route = routePlugin(activatedPlugin)

      span.setAttribute('lucid.plugin.route_path', route.path)
      span.setAttribute('lucid.plugin.route_reason', route.policy.reason)

      if (route.path === 'blocked') {
        addBreadcrumb(`blocked ${pluginSlug}:${toolName} — ${route.policy.reason}`, 'plugin')
        return JSON.stringify({
          error: 'Plugin blocked by policy',
          plugin: pluginSlug,
          tool: toolName,
          reason: route.policy.reason,
        })
      }

      // Resolve credentials for integrations (oauth2, api-key, env-var)
      let authToken: string | undefined
      let authTokenType: string | undefined
      let authHeaders: Record<string, string> | undefined
      if (ctx.authType !== 'none' && ctx.authProvider) {
        // Fail closed: authType requires credentials but no connectionId → hard error
        if (!ctx.connectionId) {
          addBreadcrumb(`missing connectionId for ${pluginSlug} (authType=${ctx.authType})`, 'plugin')
          return JSON.stringify({
            error: 'Plugin misconfigured: no connectionId for auth-required integration',
            plugin: pluginSlug,
            tool: toolName,
            authType: ctx.authType,
            authProvider: ctx.authProvider,
          })
        }

        try {
          const { adapter, cache } = await getCredentialResolver()
          const token = await cache.getOrResolve(ctx.authProvider, ctx.connectionId, adapter)
          if (token) {
            authToken = token.accessToken
            authTokenType = token.tokenType
            // Carry provider-specific headers (e.g., Nango OAuth metadata)
            if (token.metadata?.headers && typeof token.metadata.headers === 'object') {
              authHeaders = token.metadata.headers as Record<string, string>
            }
            span.setAttribute('lucid.plugin.auth_resolved', true)
          } else {
            // Fail closed: auth required but no credential found → hard error
            span.setAttribute('lucid.plugin.auth_resolved', false)
            return JSON.stringify({
              error: 'No credential found for integration',
              plugin: pluginSlug,
              tool: toolName,
              authProvider: ctx.authProvider,
              connectionId: ctx.connectionId,
            })
          }
        } catch (err) {
          // Fail closed: credential resolution error → hard error (not silent continue)
          span.setAttribute('lucid.plugin.auth_error', true)
          captureError(err, { plugin: pluginSlug, tool: toolName, phase: 'credential_resolution' })
          const msg = err instanceof Error ? err.message : 'Credential resolution failed'
          return JSON.stringify({
            error: `Credential resolution failed: ${msg}`,
            plugin: pluginSlug,
            tool: toolName,
            authProvider: ctx.authProvider,
          })
        }
      }

      const result = await executor.execute(route.path, {
        pluginSlug,
        toolName,
        args,
        authToken,
        authTokenType,
        authHeaders,
      }, route.target, ctx.fallbackMode ?? null)

      span.setAttribute('lucid.plugin.duration_ms', result.durationMs)
      span.setAttribute('lucid.plugin.execution_mode', result.executionPath)
      addBreadcrumb(
        `${result.executionPath} ${pluginSlug}:${toolName} ${result.durationMs}ms`,
        'plugin',
      )
      console.log(`[PluginBridge] ${result.executionPath} ${pluginSlug}:${toolName} ${result.durationMs}ms`)

      return result.isError
        ? `Tool error: ${JSON.stringify(result.content)}`
        : JSON.stringify(result.content)
    } catch (err) {
      span.setAttribute('lucid.plugin.error_type', classifyError(err))
      captureError(err, { plugin: pluginSlug, tool: toolName, phase: 'plugin_execution' })
      const msg = err instanceof Error ? err.message : 'Unknown plugin error'
      console.error(`[PluginBridge] ${pluginSlug}:${toolName} failed:`, msg)
      return `Plugin tool failed: ${msg}`
    }
  })
}
