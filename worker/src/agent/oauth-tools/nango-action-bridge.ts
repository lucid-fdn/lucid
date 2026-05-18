/**
 * Nango Action Bridge
 *
 * Executes OAuth integration actions via Nango's triggerAction API,
 * wrapped with Lucid's policy layer (rate limits, audit, confirmation
 * gating, OTel tracing, usage tracking).
 *
 * Called from PluginBridge when transport === 'nango'.
 * Uses the same Nango SDK singleton as tool discovery.
 */

import { getNangoClient } from './nango-client.js'
import { emitOAuthToolAudit, setAuditRpcFn } from './audit.js'
import { getCallCount, incrementCallCount } from './rate-limiter.js'
import { withSpan, type Span } from '../../observability/tracing.js'
import { captureError } from '../../monitoring/sentry.js'
import type { OAuthBinding } from './types.js'
import type { NormalizedError } from './shaper-contract.js'
import { loadActionScript } from './action-script-loader.js'
import { createNangoProxyAdapter } from './nango-proxy-adapter.js'
import { applyDefaultPageSize, shapeActionResponse } from './response-shaper.js'
import { resolveLocalActionName } from './action-aliases.js'

type RpcFn = (name: string, params: Record<string, unknown>) => PromiseLike<{ error: unknown }>

/**
 * Resource scope enforcement.
 *
 * `allowedResources` is a per-action allowlist applied at execution time so
 * that an agent with broad OAuth scopes (e.g. Slack `chat:write`) can still be
 * constrained to specific resources (e.g. only `#general`). Without this check,
 * the only protection is the OAuth grant itself, which is far too coarse.
 *
 * Shape (stored on `assistant_plugin_activations.config.allowedResources`):
 *   { <arg_name>: string[] | string }
 *
 * For each key present in `allowedResources`:
 *   - If the arg is missing from the call → deny (caller must specify it)
 *   - If the arg value is not in the allowlist → deny
 *   - Empty allowlist `[]` → deny everything (operator escape hatch)
 *   - Wildcard `'*'` in allowlist → allow any value (escape hatch)
 *
 * Keys NOT present in `allowedResources` are not constrained — only declared
 * resources are gated, so this is opt-in per arg name.
 *
 * NOTE: Comparison is **case-sensitive and exact-match** after `String()`
 * coercion. Operators authoring an allowlist for IDs like Slack channel IDs
 * (`C0123ABCD`) or Notion page IDs should mirror the exact casing the agent
 * will pass. Wildcard `'*'` is the documented escape hatch for free-form
 * resources where exact matching is impractical.
 */
export function enforceResourceScope(
  args: Record<string, unknown>,
  allowedResources: Record<string, unknown>,
): { ok: true } | { ok: false; resource: string; value: unknown; allowed: string[] } {
  for (const [resource, rawAllowed] of Object.entries(allowedResources)) {
    const allowed = Array.isArray(rawAllowed)
      ? (rawAllowed as unknown[]).map(String)
      : rawAllowed != null
        ? [String(rawAllowed)]
        : []

    // Wildcard short-circuit — operator explicitly opted out of gating this arg.
    if (allowed.includes('*')) continue

    const value = args[resource]
    if (value === undefined || value === null) {
      return { ok: false, resource, value, allowed }
    }

    // Support both scalar args and array args (e.g. `channels: ['#a', '#b']`).
    const values = Array.isArray(value) ? value.map(String) : [String(value)]
    for (const v of values) {
      if (!allowed.includes(v)) {
        return { ok: false, resource, value: v, allowed }
      }
    }
  }
  return { ok: true }
}

function normalizeError(err: unknown, provider: string, action: string): NormalizedError {
  const raw = err as Record<string, any> | undefined
  const status = raw?.response?.status ?? raw?.status ?? raw?.payload?.status
  const errorCode = raw?.response?.data?.code
    ?? raw?.response?.data?.error?.code
    ?? raw?.payload?.code
    ?? raw?.code

  const messageCandidates = [
    raw?.response?.data?.message,
    raw?.response?.data?.error_description,
    raw?.response?.data?.error?.message,
    raw?.response?.data?.error,
    raw?.payload?.message,
    raw?.payload?.error,
    raw?.cause?.message,
    err instanceof Error ? err.message : undefined,
  ]
  const baseMessage = messageCandidates.find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
  ) ?? 'Integration action execution failed'

  const lowerMessage = baseMessage.toLowerCase()
  const authLike =
    status === 401
    || /unauthorized|invalid.?token|token expired|auth/i.test(baseMessage)
  const permissionLike =
    status === 403
    || /forbidden|restricted_resource|permission|not authorized|access denied|not shared/i.test(baseMessage)

  let message = baseMessage
  if (provider === 'notion' && permissionLike) {
    message =
      'Notion denied access to this content. Make sure the target workspace, page, or database is shared with the connected integration, then try again.'
  } else if (provider === 'notion' && authLike) {
    message =
      'The Notion connection appears to be expired or unauthorized. Please reconnect the integration and try again.'
  }

  const retryable = status === 429 || (status >= 500 && status < 600)
    || lowerMessage.includes('timed out') || lowerMessage.includes('econnreset')

  return {
    error: message,
    provider,
    action,
    retryable,
    ...(status ? { status_code: status } : {}),
    ...(typeof errorCode === 'string' && errorCode ? { error_code: errorCode } : {}),
  }
}

/** Run-level context for Nango action execution (set per-binding in builder.ts). */
export interface NangoActionContext {
  binding: OAuthBinding
  runId: string
  assistantId: string
  rpcFn?: RpcFn
}

/**
 * Execute a Nango action with full policy enforcement.
 * Returns a JSON string — same contract as PluginBridge and built-in executors.
 */
export async function executeNangoAction(
  actionName: string,
  args: Record<string, unknown>,
  ctx: NangoActionContext,
): Promise<string> {
  if (ctx.rpcFn) setAuditRpcFn(ctx.rpcFn)

  const t0 = Date.now()
  const { binding, runId, assistantId } = ctx
  const provider = binding.provider
  const connectionId = binding.connectionId
  const integrationId = binding.integrationId || provider

  // 1. Rate limit check
  const currentCount = await getCallCount(runId, provider)
  if (currentCount >= binding.maxCallsPerRun) {
    emitOAuthToolAudit({
      assistantId, runId, provider, action: actionName,
      connectionId, args, status: 'denied',
      errorCode: 'rate_limit_exceeded', durationMs: Date.now() - t0,
    })
    return JSON.stringify({
      error: `Rate limit exceeded: max ${binding.maxCallsPerRun} ${provider} calls per run`,
      provider, action: actionName, retryable: false,
    })
  }

  // 2. Confirmation gating
  if (binding.requiresConfirmationActions.includes(actionName)) {
    emitOAuthToolAudit({
      assistantId, runId, provider, action: actionName,
      connectionId, args, status: 'gated', durationMs: Date.now() - t0,
    })
    return JSON.stringify({
      gated: true,
      message: `Action "${actionName}" requires user confirmation before execution.`,
      provider, action: actionName, args,
    })
  }

  // 3. Resource scope enforcement. Even if OAuth granted broad scopes, the
  //    operator can pin a per-action allowlist (e.g. only post to #general).
  if (binding.allowedResources && Object.keys(binding.allowedResources).length > 0) {
    const scopeCheck = enforceResourceScope(args, binding.allowedResources)
    if (!scopeCheck.ok) {
      emitOAuthToolAudit({
        assistantId, runId, provider, action: actionName,
        connectionId, args, status: 'denied',
        errorCode: 'resource_scope_denied', durationMs: Date.now() - t0,
      })
      return JSON.stringify({
        error: `Resource "${scopeCheck.resource}" value ${JSON.stringify(scopeCheck.value)} is not in the allowed list for "${actionName}"`,
        provider, action: actionName, retryable: false,
        denied_resource: scopeCheck.resource,
        allowed_values: scopeCheck.allowed,
      })
    }
  }

  // 4. Execute via Nango triggerAction
  const nango = getNangoClient()
  if (!nango) {
    return JSON.stringify({ error: 'OAuth integration is not configured', provider, action: actionName, retryable: false })
  }

  await incrementCallCount(runId, provider)

  // Inject default page_size for list/search actions when agent didn't specify one
  const shapedArgs = applyDefaultPageSize(provider, actionName, args)
  const executionActionName = resolveLocalActionName(integrationId, actionName)

  return withSpan('nango.action', {
    'lucid.nango.provider': provider,
    'lucid.nango.action': actionName,
    'lucid.nango.integration_id': integrationId,
    'lucid.nango.connection_id': connectionId,
    'lucid.nango.assistant_id': assistantId,
  }, async (span: Span) => {
    try {
      // Try in-process execution first, fall back to triggerAction
      const script = loadActionScript(integrationId, actionName)
      let result: unknown
      if (script) {
        const adapter = createNangoProxyAdapter(connectionId, integrationId)
        result = await Promise.race([
          script.exec(adapter, shapedArgs),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Action "${actionName}" timed out after 30s`)), 30_000),
          ),
        ])
        span.setAttribute('lucid.nango.execution_mode', 'in_process')
      } else {
        result = await nango.triggerAction(integrationId, connectionId, executionActionName, shapedArgs)
        span.setAttribute('lucid.nango.execution_mode', 'trigger_action')
      }
      const durationMs = Date.now() - t0
      span.setAttribute('lucid.nango.duration_ms', durationMs)
      span.setAttribute('lucid.nango.status', 'success')

      emitOAuthToolAudit({
        assistantId, runId, provider, action: actionName,
        connectionId, args, status: 'success', durationMs,
      })

      if (ctx.rpcFn) {
        void Promise.resolve(ctx.rpcFn('increment_oauth_usage', {
          p_connection_id: connectionId, p_success: true,
        })).catch(() => {})
      }

      const shaped = shapeActionResponse(provider, actionName, result)

      if (shaped.compacted) {
        span.setAttribute('lucid.nango.response_compacted', true)
        span.setAttribute('lucid.nango.original_chars', shaped.originalChars)
        span.setAttribute('lucid.nango.shaped_chars', shaped.shapedChars)
        if (shaped.resultCount != null) {
          span.setAttribute('lucid.nango.result_count', shaped.resultCount)
        }
      }

      // Use pre-serialized string from shaper when available (avoids double serialization)
      return shaped.serialized ?? JSON.stringify(shaped.shaped)
    } catch (err) {
      const durationMs = Date.now() - t0
      const errorMsg = err instanceof Error ? err.message : 'Integration action execution failed'

      span.setAttribute('lucid.nango.duration_ms', durationMs)
      span.setAttribute('lucid.nango.status', 'error')
      span.setAttribute('lucid.nango.error', errorMsg)

      captureError(err, { assistantId, runId, channel: provider })

      emitOAuthToolAudit({
        assistantId, runId, provider, action: actionName,
        connectionId, args, status: 'error',
        errorCode: 'execution_error', durationMs,
      })

      if (ctx.rpcFn) {
        void Promise.resolve(ctx.rpcFn('increment_oauth_usage', {
          p_connection_id: connectionId, p_success: false,
        })).catch(() => {})
      }

      // Passive health: flag broken connections on auth errors
      const normalized = normalizeError(err, provider, actionName)
      const shouldDowngradeHealth = normalized.status_code === 401 || normalized.status_code === 403
      if (shouldDowngradeHealth) {
        const healthStatus = normalized.status_code === 401 ? 'expired' : 'error'
        if (ctx.rpcFn) {
          void Promise.resolve(ctx.rpcFn('update_connection_health', {
            p_connection_id: connectionId,
            p_status: healthStatus,
            p_error_code: normalized.error_code ?? String(normalized.status_code),
            p_error_message: normalized.error,
          })).catch(() => {})
        }
      }

      return JSON.stringify(normalized)
    }
  })
}
