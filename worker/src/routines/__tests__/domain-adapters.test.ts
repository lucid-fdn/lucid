import type { SupabaseClient } from '@supabase/supabase-js'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { Config } from '../../config.js'
import { executeRoutineDomainAdapter } from '../domain-adapters.js'

vi.mock('../../jobs/knowledge-source-refresh.js', () => ({
  runKnowledgeSourceRefreshJobs: vi.fn(async () => ({ scanned: 2, refreshed: 1, changed: 0, failed: 0, skipped: 1 })),
}))

vi.mock('../../jobs/brain-ops.js', () => ({
  runKnowledgeBrainOps: vi.fn(async () => ({ scannedOrgs: 1, eventsWritten: 2, staleSourcesUpdated: 0 })),
}))

vi.mock('../../pm-sync/reconcile.js', () => ({
  reconcilePmMirrors: vi.fn(async () => undefined),
}))

interface Operation {
  table: string
  action: string
  payload?: unknown
}

class FakeQuery {
  private filters: Array<[string, unknown]> = []
  private payload: unknown
  private selected: string | null = null

  constructor(
    private readonly table: string,
    private readonly operations: Operation[],
    private readonly rows: Record<string, unknown>,
  ) {}

  select(columns?: string) {
    this.selected = columns ?? '*'
    return this
  }

  insert(payload: unknown) {
    this.payload = payload
    this.operations.push({ table: this.table, action: 'insert', payload })
    return this
  }

  update(payload: unknown) {
    this.payload = payload
    this.operations.push({ table: this.table, action: 'update', payload })
    return this
  }

  upsert(payload: unknown) {
    this.payload = payload
    this.operations.push({ table: this.table, action: 'upsert', payload })
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value])
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  async maybeSingle() {
    return { data: this.row(), error: null }
  }

  async single() {
    return { data: this.row() ?? { id: `${this.table}-row-id` }, error: null }
  }

  private row() {
    if (this.selected === 'id') return { id: `${this.table}-row-id` }
    return this.rows[this.table] ?? { id: `${this.table}-row-id` }
  }
}

function fakeSupabase(rows: Record<string, unknown> = {}) {
  const operations: Operation[] = []
  return {
    operations,
    client: {
      from(table: string) {
        return new FakeQuery(table, operations, rows)
      },
    } as unknown as SupabaseClient,
  }
}

const baseTask = {
  id: 'task-1',
  assistant_id: '00000000-0000-0000-0000-000000000001',
  org_id: '00000000-0000-0000-0000-000000000002',
  name: 'Routine',
  task_prompt: 'Do the thing.',
}

describe('Routine domain adapters', () => {
  it('applies Work Graph updates and writes bounded refs', async () => {
    const db = fakeSupabase()
    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'work_graph',
      task_kind: 'work_graph_action',
      work_item_id: '00000000-0000-0000-0000-000000000003',
      project_id: '00000000-0000-0000-0000-000000000004',
      trigger_config: {
        action: 'update_status',
        status: 'in_progress',
        summary: 'Routine moved the card.',
      },
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.workGraphRefs).toEqual(expect.objectContaining({
      work_item_id: '00000000-0000-0000-0000-000000000003',
      updated_work_item_status: 'in_progress',
    }))
    expect(db.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'human_work_items', action: 'update' }),
      expect.objectContaining({ table: 'work_graph_events', action: 'insert' }),
      expect.objectContaining({ table: 'work_artifact_links', action: 'insert' }),
    ]))
  })

  it('queues Browser Procedure runs through Agent Ops and Browser ledgers', async () => {
    const db = fakeSupabase({
      agent_ops_browser_procedures: {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'Login smoke',
        slug: 'login-smoke',
        trust_state: 'active',
        project_id: null,
      },
      agent_ops_browser_procedure_versions: {
        id: '00000000-0000-0000-0000-000000000006',
        version: 3,
        risk_level: 'low',
      },
    })

    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'browser_procedure',
      task_kind: 'browser_procedure_run',
      target_id: '00000000-0000-0000-0000-000000000005',
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.agentOpsRunId).toBe('agent_ops_runs-row-id')
    expect(result.browserRunId).toBe('agent_ops_browser_procedure_runs-row-id')
    expect(db.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'agent_ops_runs', action: 'insert' }),
      expect.objectContaining({ table: 'agent_ops_browser_procedure_runs', action: 'upsert' }),
    ]))
  })

  it('runs Knowledge source refresh through the existing worker job', async () => {
    const db = fakeSupabase()
    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'knowledge',
      task_kind: 'knowledge_job',
      trigger_config: { operation: 'source_refresh' },
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.knowledgeRefs).toEqual(expect.objectContaining({
      operation: 'source_refresh',
      scanned: 2,
      refreshed: 1,
    }))
  })

  it('queues Knowledge Think through Agent Ops and the maintenance ledger', async () => {
    const db = fakeSupabase()
    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'knowledge',
      task_kind: 'knowledge_job',
      project_id: '00000000-0000-0000-0000-000000000004',
      trigger_config: { operation: 'knowledge.think', query: 'What changed this week?', persist_claim: true },
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.knowledgeRefs).toEqual(expect.objectContaining({
      operation: 'knowledge.think',
      agent_ops_run_id: 'agent_ops_runs-row-id',
      maintenance_event_id: 'knowledge_maintenance_events-row-id',
    }))
    expect(db.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'agent_ops_runs', action: 'insert' }),
      expect.objectContaining({ table: 'knowledge_maintenance_events', action: 'insert' }),
    ]))
  })

  it('snapshots a local Engine Home through EHV and persists the digest', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'lucid-ehv-routine-'))
    await writeFile(path.join(home, 'AGENTS.md'), 'agent identity')
    const db = fakeSupabase()

    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'engine_home',
      task_kind: 'engine_home_job',
      trigger_config: {
        operation: 'engine_home.snapshot',
        root_dir: home,
        engine: 'hermes',
        runtime_flavor: 'c1_managed',
        home_id: 'hermes:test-home',
      },
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.engineHomeRefs).toEqual(expect.objectContaining({
      snapshot_id: 'engine_home_snapshots-row-id',
      entry_count: 1,
    }))
    expect(db.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'engine_home_snapshots', action: 'upsert' }),
    ]))
  })

  it('observes native engine schedules without delegating execution', async () => {
    const db = fakeSupabase()
    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'engine_home',
      task_kind: 'engine_home_job',
      trigger_config: {
        operation: 'native_scheduler.observe',
        engine: 'openclaw',
        runtime_flavor: 'c2a_autonomous',
        runtime_id: 'runtime-1',
        native_schedules: [
          { id: 'native-daily', name: 'Native daily review', cron: '0 9 * * *', timezone: 'UTC', prompt: 'Review local queue.' },
        ],
      },
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.engineHomeRefs).toEqual(expect.objectContaining({
      native_schedule_count: 1,
      imported_routine_ids: [],
    }))
    expect(result.sanitizedEvidence).toEqual(expect.objectContaining({
      delegation: 'disabled_until_ack_reconcile_stable',
    }))
    expect(db.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'engine_home_diff_candidates', action: 'insert' }),
    ]))
    expect(db.operations.some((operation) => operation.table === 'agent_scheduled_tasks')).toBe(false)
  })

  it('imports native engine schedules as disabled Routine candidates', async () => {
    const db = fakeSupabase()
    const result = await executeRoutineDomainAdapter({
      ...baseTask,
      target_type: 'engine_home',
      task_kind: 'engine_home_job',
      trigger_config: {
        operation: 'engine_home.native_scheduler.import',
        engine: 'hermes',
        runtime_flavor: 'c1_managed',
        runtime_id: 'runtime-2',
        schedules: [
          { nativeId: 'dream-review', label: 'Dream review', cronExpression: '30 7 * * 1-5', tz: 'Europe/Paris', instruction: 'Review queued dreams.' },
        ],
      },
    }, db.client, {} as Config, 'receipt-1')

    expect(result.status).toBe('succeeded')
    expect(result.engineHomeRefs).toEqual(expect.objectContaining({
      native_schedule_count: 1,
      imported_routine_ids: ['agent_scheduled_tasks-row-id'],
    }))
    expect(db.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'engine_home_diff_candidates', action: 'insert' }),
      expect.objectContaining({
        table: 'agent_scheduled_tasks',
        action: 'upsert',
        payload: expect.objectContaining({
          enabled: false,
          status: 'pending',
          source_kind: 'import',
          runtime_selector: expect.objectContaining({
            engine: 'hermes',
            runtimeFlavor: 'dedicated',
            nativeScheduler: 'observe',
            importedFromNativeScheduler: true,
          }),
        }),
      }),
    ]))
  })
})
