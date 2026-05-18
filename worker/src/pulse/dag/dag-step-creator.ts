/**
 * DagStepCreator — Worker-side single authority for orchestration_steps
 * creation.
 *
 * Phase 4N-0, Task 10. Consolidates the two duplicate insert paths that
 * existed before this module:
 *
 *   - `worker/src/pulse/executors/step-tracker.ts` (worker-side, inserts
 *     with `status='running'` + started_at + timeout_at + input)
 *   - `src/app/api/runtimes/steps/enqueue/route.ts` (REST-side, inserts
 *     with `status='pending'` + minimal fields)
 *
 * Both paths use the same Zod schema and row builder. The canonical copy
 * lives in `contracts/dag-step.ts` (imported by the Next.js src/ side);
 * this file mirrors it because the worker tsconfig has `rootDir: ./src`
 * and cannot import value modules from outside the package. The sync is
 * enforced by `worker/src/pulse/__tests__/contract-sync.test.ts` so any
 * drift between the two files breaks the build.
 *
 * DAG columns: `dagId`, `dagNodeId`, `runtimeTarget`, `routeClass` are
 * persisted via the columns added by
 * `20260407220100_orchestration_steps_dag_columns.sql`. The DAG-scoped
 * idempotency index lives in
 * `20260407220300_orchestration_steps_dag_idempotency.sql` — it makes
 * the legacy `(event_id, attempt, step_type)` unique constraint
 * conditional on `dag_id IS NULL` so multiple leaves of the same DAG
 * sharing one root event do not collide.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Mirrors the CHECK constraint in 20260406200000_orchestration_steps.sql
export const DAG_STEP_TYPES = ['inbound', 'outbound', 'scheduled', 'webhook', 'approval'] as const
export type DagStepType = (typeof DAG_STEP_TYPES)[number]

// Forward-compat (Phase 4N-a columns)
export const DAG_RUNTIME_TARGETS = ['shared', 'dedicated'] as const
export const DAG_ROUTE_CLASSES = ['fast', 'strong', 'external'] as const

export const DAG_STEP_INITIAL_STATUSES = ['pending', 'running'] as const
export type DagStepInitialStatus = (typeof DAG_STEP_INITIAL_STATUSES)[number]

export const dagStepCreateInputSchema = z.object({
  eventId: z.string().uuid(),
  attempt: z.number().int().min(0),
  stepType: z.enum(DAG_STEP_TYPES),
  executorType: z.string().min(1),
  agentId: z.string().uuid(),
  orgId: z.string().uuid(),
  runId: z.string().min(1),
  initialStatus: z.enum(DAG_STEP_INITIAL_STATUSES).default('pending'),

  // Optional execution payload (worker-side callers pass these)
  webhookUrl: z.string().url().optional(),
  timeoutAt: z.string().datetime().optional(),
  input: z.record(z.string(), z.unknown()).optional(),

  // Phase 4N-a DAG linkage — persisted to orchestration_steps when set.
  // `dagId`/`dagNodeId` together drive the DAG-scoped idempotency index.
  dagId: z.string().uuid().nullable().optional(),
  dagNodeId: z.string().uuid().nullable().optional(),
  runtimeTarget: z.enum(DAG_RUNTIME_TARGETS).nullable().optional(),
  routeClass: z.enum(DAG_ROUTE_CLASSES).nullable().optional(),
})

export type DagStepCreateInput = z.input<typeof dagStepCreateInputSchema>
export type DagStepCreateInputParsed = z.output<typeof dagStepCreateInputSchema>

export interface DagStepCreateResult {
  stepId: string
  isNew: boolean
}

/**
 * Deterministic row builder — given a validated input, returns the exact
 * column set to INSERT. Both this class and the REST route call it so the
 * column mapping has a single owner.
 */
export function buildStepRow(input: DagStepCreateInputParsed): Record<string, unknown> {
  const row: Record<string, unknown> = {
    run_id: input.runId,
    event_id: input.eventId,
    attempt: input.attempt,
    step_type: input.stepType,
    executor_type: input.executorType,
    agent_id: input.agentId,
    org_id: input.orgId,
    status: input.initialStatus,
    webhook_url: input.webhookUrl ?? null,
    callback_status: input.webhookUrl ? 'pending' : null,
    timeout_at: input.timeoutAt ?? null,
    input: input.input ?? null,
    // Phase 4N-a DAG linkage. NULL for non-DAG callers (Phase 3N step
    // pipeline + REST runtime enqueue path); set for scheduler-driven
    // leaves so the DAG idempotency index covers them.
    dag_id: input.dagId ?? null,
    dag_node_id: input.dagNodeId ?? null,
    runtime_target: input.runtimeTarget ?? null,
    route_class: input.routeClass ?? null,
  }

  // Worker-side rows start already `running`, so anchor `started_at` now —
  // orphan detector (Phase 4N-0, Task 6) uses this column as its claim-time
  // anchor for the partial index `idx_orch_steps_stuck_claimed`.
  if (input.initialStatus === 'running') {
    row.started_at = new Date().toISOString()
  }

  return row
}

/**
 * Idempotent INSERT for `orchestration_steps`. Single authority for the
 * create-with-conflict path — both the worker `DagStepCreator` class and
 * the REST enqueue route delegate to a function with this exact shape so
 * conflict semantics cannot drift between paths.
 *
 * MIRRORS `contracts/dag-step.ts` `insertOrchestrationStep()`. Both copies
 * MUST stay byte-equivalent (enforced by `__tests__/contract-sync.test.ts`).
 *
 * Behavior:
 *   - Validates input via Zod (throws on bad shape).
 *   - Inserts the row built by `buildStepRow()`.
 *   - On unique-key conflict (`event_id, attempt, step_type`), selects the
 *     existing row and returns its id with `isNew: false`. Retry-safe.
 *   - Throws on any other Postgres error.
 */
export async function insertOrchestrationStep(
  supabase: SupabaseClient,
  rawInput: DagStepCreateInput,
): Promise<DagStepCreateResult> {
  const input = dagStepCreateInputSchema.parse(rawInput)
  const row = buildStepRow(input)

  const { data, error } = await supabase
    .from('orchestration_steps')
    .insert(row)
    .select('id')
    .single()

  if (!error && data?.id) {
    return { stepId: data.id, isNew: true }
  }

  // PostgREST surfaces unique-index collisions as code 23505. Fall back to a
  // select on the idempotency key so callers always get a stepId. DAG rows
  // and non-DAG rows live under different unique indexes:
  //   * DAG: (dag_id, dag_node_id, attempt) — idx_orch_steps_dag_attempt
  //   * Non-DAG: (event_id, attempt, step_type) — idx_orch_steps_idempotent
  // Pick the right key based on whether this insert was DAG-linked.
  if (error && (error.code === '23505' || /duplicate key/i.test(error.message ?? ''))) {
    let lookup = supabase.from('orchestration_steps').select('id')
    if (input.dagId && input.dagNodeId) {
      lookup = lookup
        .eq('dag_id', input.dagId)
        .eq('dag_node_id', input.dagNodeId)
        .eq('attempt', input.attempt)
    } else {
      lookup = lookup
        .eq('event_id', input.eventId)
        .eq('attempt', input.attempt)
        .eq('step_type', input.stepType)
    }
    const { data: existing } = await lookup.maybeSingle()

    if (existing?.id) {
      return { stepId: existing.id, isNew: false }
    }
  }

  throw error ?? new Error('[dag-step] insert returned no row')
}

/**
 * Object-style facade over `insertOrchestrationStep()`. Kept for callers
 * that prefer DI of the supabase client at construction time (e.g. the
 * worker-side `step-tracker`). New code can call the function directly.
 */
export class DagStepCreator {
  constructor(private readonly supabase: SupabaseClient) {}

  create(rawInput: DagStepCreateInput): Promise<DagStepCreateResult> {
    return insertOrchestrationStep(this.supabase, rawInput)
  }
}
