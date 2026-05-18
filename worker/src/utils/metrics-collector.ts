/**
 * MetricsCollector — Per-request latency & DB ops observability (P2 #18)
 *
 * @deprecated This bridge is superseded by OpenTelemetry spans (see worker/src/observability/tracing.ts).
 * OTel provides standardized, vendor-neutral observability with auto-instrumentation for DB queries,
 * HTTP calls, and custom spans. This class is kept for reference but should not be used in new code.
 *
 * Migration guide:
 * - Replace `new MetricsCollector(runId)` with OTel span context
 * - Replace `mc.startTimer('llm_call')` with `startLlmCallSpan(...)`
 * - Replace `mc.dbOp()` with auto-instrumentation (already enabled)
 * - Replace `mc.emit()` with span.end() (automatic)
 *
 * Instantiated once per inbound/outbound processing run.
 * Collects fine-grained timing for each operation phase,
 * counts DB operations, and emits structured metrics at the end.
 *
 * Usage (deprecated):
 *   const mc = new MetricsCollector(runId)
 *   const end = mc.startTimer('llm_call')
 *   await callLLM(...)
 *   end()
 *   // ... later:
 *   mc.dbOp('select', 'assistant_messages')
 *   mc.emit()
 */

export interface TimerEntry {
  operation: string
  durationMs: number
  metadata?: Record<string, unknown>
}

export interface DbOpEntry {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  table: string
  durationMs?: number
}

export interface MetricsSummary {
  runId: string
  totalDurationMs: number
  timers: TimerEntry[]
  dbOps: DbOpEntry[]
  dbOpCount: number
  dbOpsByTable: Record<string, number>
  dbOpsByType: Record<string, number>
  errorCount: number
  phases: Record<string, number> // phase name → total ms
}

export class MetricsCollector {
  private startTime: number
  private timers: TimerEntry[] = []
  private dbOpsLog: DbOpEntry[] = []
  private errors: number = 0

  constructor(private runId: string) {
    this.startTime = Date.now()
  }

  /**
   * Start a named timer. Returns a function to stop it.
   * Optionally attach metadata (model name, table, etc.)
   */
  startTimer(operation: string, metadata?: Record<string, unknown>): () => number {
    const start = Date.now()
    return () => {
      const durationMs = Date.now() - start
      this.timers.push({ operation, durationMs, metadata })
      return durationMs
    }
  }

  /**
   * Record a DB operation. Optionally wrap an async fn to auto-time it.
   */
  dbOp(operation: DbOpEntry['operation'], table: string, durationMs?: number): void {
    this.dbOpsLog.push({ operation, table, durationMs })
  }

  /**
   * Wrap an async DB operation for automatic timing + recording.
   */
  async timedDbOp<T>(
    operation: DbOpEntry['operation'],
    table: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()
    try {
      const result = await fn()
      this.dbOpsLog.push({ operation, table, durationMs: Date.now() - start })
      return result
    } catch (err) {
      this.dbOpsLog.push({ operation, table, durationMs: Date.now() - start })
      this.errors++
      throw err
    }
  }

  /** Record an error (does not throw) */
  recordError(): void {
    this.errors++
  }

  /** Get the total elapsed time since collector creation */
  elapsed(): number {
    return Date.now() - this.startTime
  }

  /**
   * Build a structured summary of all collected metrics.
   */
  summarize(): MetricsSummary {
    const dbOpsByTable: Record<string, number> = {}
    const dbOpsByType: Record<string, number> = {}
    for (const op of this.dbOpsLog) {
      dbOpsByTable[op.table] = (dbOpsByTable[op.table] || 0) + 1
      dbOpsByType[op.operation] = (dbOpsByType[op.operation] || 0) + 1
    }

    // Aggregate timers by operation name
    const phases: Record<string, number> = {}
    for (const t of this.timers) {
      phases[t.operation] = (phases[t.operation] || 0) + t.durationMs
    }

    return {
      runId: this.runId,
      totalDurationMs: this.elapsed(),
      timers: this.timers,
      dbOps: this.dbOpsLog,
      dbOpCount: this.dbOpsLog.length,
      dbOpsByTable,
      dbOpsByType,
      errorCount: this.errors,
      phases,
    }
  }

  /**
   * Emit metrics as structured log. Can be collected by log aggregators
   * (Datadog, Grafana Loki, CloudWatch, etc.)
   */
  emit(): void {
    const summary = this.summarize()

    // Structured JSON log line — parseable by log aggregators
    console.log(JSON.stringify({
      type: 'metrics',
      runId: summary.runId,
      totalMs: summary.totalDurationMs,
      dbOps: summary.dbOpCount,
      errors: summary.errorCount,
      phases: summary.phases,
      dbByTable: summary.dbOpsByTable,
      dbByType: summary.dbOpsByType,
      // Individual timers only in dev/debug (too verbose for prod)
      ...(process.env.NODE_ENV !== 'production' ? { timers: summary.timers } : {}),
    }))
  }

  /**
   * Emit a condensed one-line summary for quick monitoring.
   */
  emitSummaryLine(): void {
    const s = this.summarize()
    const phaseStr = Object.entries(s.phases)
      .map(([k, v]) => `${k}=${v}ms`)
      .join(' ')

    console.log(
      `[metrics] run=${s.runId} total=${s.totalDurationMs}ms dbOps=${s.dbOpCount} errors=${s.errorCount} ${phaseStr}`
    )
  }
}