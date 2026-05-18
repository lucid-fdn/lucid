/**
 * OAuth Tool Audit
 *
 * Emits durable audit records for every OAuth tool call.
 * Primary: insert into oauth_audit_events table via supabase RPC.
 * Fallback: structured JSON log if DB insert fails.
 */

import type { OAuthToolAuditEvent, OAuthToolCallStatus } from './types.js'
import { captureError } from '../../monitoring/sentry.js'

// ---------------------------------------------------------------------------
// Supabase RPC handle — set once by executor before first audit
// ---------------------------------------------------------------------------

type RpcFn = (name: string, params: Record<string, unknown>) => PromiseLike<{ error: unknown }>

let _rpcFn: RpcFn | null = null

/** Set the supabase RPC function for durable audit writes. Call once at executor init. */
export function setAuditRpcFn(fn: RpcFn): void {
  _rpcFn = fn
}

// ---------------------------------------------------------------------------
// Arg sanitization (recursive — handles nested objects)
// ---------------------------------------------------------------------------

const REDACT_PATTERN = /token|secret|key|password|auth|credential|bearer|jwt|signature/i
const MAX_DEPTH = 3

function sanitizeArgs(args: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > MAX_DEPTH) return { _truncated: true }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (REDACT_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeArgs(value as Record<string, unknown>, depth + 1)
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '…'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/**
 * Emit a durable audit event for an OAuth tool call.
 * Fire-and-forget — never blocks the caller.
 * Writes to DB if RPC function is set, falls back to console.log.
 */
export function emitOAuthToolAudit(params: {
  assistantId: string
  runId: string
  provider: string
  action: string
  connectionId: string
  args: Record<string, unknown>
  status: OAuthToolCallStatus
  errorCode?: string
  durationMs: number
}): void {
  const sanitizedArgs = sanitizeArgs(params.args)

  const event: OAuthToolAuditEvent = {
    event_type: 'oauth_tool_call',
    assistant_id: params.assistantId,
    run_id: params.runId,
    provider: params.provider,
    action: params.action,
    connection_id: params.connectionId,
    args_summary: sanitizedArgs,
    status: params.status,
    error_code: params.errorCode,
    duration_ms: params.durationMs,
    timestamp: new Date().toISOString(),
  }

  // Structured log (always — for real-time observability)
  console.log(`[oauth-audit] ${JSON.stringify(event)}`)

  // Durable DB write (fire-and-forget)
  if (_rpcFn) {
    void Promise.resolve(
      _rpcFn('insert_oauth_audit_event', {
        p_assistant_id: params.assistantId,
        p_run_id: params.runId,
        p_provider: params.provider,
        p_action: params.action,
        p_connection_id: params.connectionId,
        p_status: params.status,
        p_error_code: params.errorCode || null,
        p_args_summary: sanitizedArgs,
        p_duration_ms: params.durationMs,
      }),
    ).catch((err) => {
      captureError(err, {
        assistantId: params.assistantId,
        runId: params.runId,
      })
    })
  }
}
