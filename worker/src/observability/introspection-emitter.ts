/**
 * IntrospectionEmitter — Batched writer for introspection events.
 *
 * Buffers events and flushes every 200ms, 50 events, or on `run_end`.
 * Fire-and-forget — never blocks the agent loop.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type IntrospectionKind =
  | 'run_start' | 'context_loaded' | 'routing_decision'
  | 'capability_surface'
  | 'llm_start' | 'llm_end'
  | 'tool_start' | 'tool_cache_hit' | 'tool_result' | 'tool_error'
  | 'approval_wait' | 'approval_resolved'
  | 'cost_update'
  | 'memory_load' | 'memory_extract' | 'board_memory_load'
  | 'subagent_spawn' | 'subagent_complete'
  | 'run_end'

interface IntrospectionRow {
  org_id: string
  agent_id: string
  run_id: string
  kind: IntrospectionKind
  data: Record<string, unknown>
  tool_call_id?: string
  seq: number
}

const SENSITIVE_PATTERNS = [
  // API keys, tokens, secrets (common naming patterns)
  /(?:api[_-]?key|token|secret|password|authorization|bearer|credential|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi,
  // Bearer tokens in headers
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  // Long hex strings (32+ chars, likely hashes/keys)
  /\b[0-9a-f]{32,}\b/gi,
  // Base64 encoded values that look like secrets (40+ chars)
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
  // sk-* / pk-* / rk-* style API keys
  /\b[sprd]k[_-][A-Za-z0-9_-]{20,}\b/g,
]

function redactSensitive(text: string): string {
  let result = text
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

const FLUSH_INTERVAL_MS = 200
const FLUSH_BATCH_SIZE = 50

export class IntrospectionEmitter {
  private buffer: IntrospectionRow[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private seq = 0

  constructor(
    private supabase: SupabaseClient,
    private orgId: string,
    private agentId: string,
    private runId: string,
    private enabled: boolean,
  ) {}

  emit(kind: IntrospectionKind, data: Record<string, unknown> = {}, toolCallId?: string): void {
    if (!this.enabled) return

    // Redact sensitive data from tool previews
    const safeData = { ...data }
    if (typeof safeData.args_preview === 'string') {
      safeData.args_preview = redactSensitive(safeData.args_preview)
    }
    if (typeof safeData.output_preview === 'string') {
      safeData.output_preview = redactSensitive(safeData.output_preview)
    }

    this.buffer.push({
      org_id: this.orgId,
      agent_id: this.agentId,
      run_id: this.runId,
      kind,
      data: safeData,
      tool_call_id: toolCallId,
      seq: this.seq++,
    })

    // Immediate flush on run_end or batch full
    if (kind === 'run_end' || this.buffer.length >= FLUSH_BATCH_SIZE) {
      void this.flush()
      return
    }

    // Schedule flush if not already scheduled
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null
        void this.flush()
      }, FLUSH_INTERVAL_MS)
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true

    // Clear pending timer
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // Drain buffer
    const batch = this.buffer.splice(0)

    try {
      const { error } = await this.supabase
        .from('mc_introspection_events')
        .insert(batch)

      if (error) {
        console.warn(`[introspection] Failed to flush ${batch.length} events:`, error.message)
      }
    } catch (err) {
      console.warn(`[introspection] Flush error:`, err instanceof Error ? err.message : err)
    } finally {
      this.flushing = false
    }

    // If more events accumulated during flush, schedule another
    if (this.buffer.length > 0) {
      void this.flush()
    }
  }

  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.flush()
  }
}

/**
 * Create an emitter instance. Returns a functional no-op when disabled.
 * Avoids conditional checks at every emit site.
 */
export function createIntrospectionEmitter(
  supabase: SupabaseClient | undefined,
  orgId: string | undefined,
  agentId: string,
  runId: string,
  enabled: boolean,
): IntrospectionEmitter {
  // Disabled if no supabase, no org, or feature off
  const effective = enabled && !!supabase && !!orgId
  return new IntrospectionEmitter(
    supabase as SupabaseClient,
    orgId ?? '',
    agentId,
    runId,
    effective,
  )
}
