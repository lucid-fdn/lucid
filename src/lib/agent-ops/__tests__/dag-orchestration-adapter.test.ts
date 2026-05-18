import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AgentOpsDagOrchestrationAdapter } from '../dag-orchestration-adapter'
import { getAgentOpsWorkflow } from '../workflow-registry'
import type { AgentOpsRun } from '../workflow-types'
import type { SchedulerBridge } from '@/lib/dag/scheduler-bridge'

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const DAG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makeRun(overrides: Partial<AgentOpsRun> = {}): AgentOpsRun {
  const now = '2026-04-28T00:00:00.000Z'
  return {
    id: RUN_ID,
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    assistantId: AGENT_ID,
    requestedByUserId: null,
    workflowId: 'review',
    workflowVersion: '1.0.0',
    status: 'queued',
    runMode: 'execute',
    scope: { type: 'pull_request', ref: 'pr-7', label: 'PR 7', metadata: {} },
    input: { target: 'pr-7' },
    output: null,
    agentRunIds: [],
    humanWorkItemIds: [],
    approvalIds: [],
    artifactCount: 0,
    findingCount: 0,
    orchestrationDagId: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeSupabase(options: {
  browserProcedures?: unknown[]
  browserProcedureVersion?: unknown | null
  browserHostPlaybooks?: unknown[]
} = {}) {
  const inserts: Array<{ table: string; payload: unknown }> = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'agent_ops_browser_procedures') {
        const qb = {
          select: vi.fn(() => qb),
          eq: vi.fn(() => qb),
          or: vi.fn(() => qb),
          is: vi.fn(() => qb),
          order: vi.fn(() => qb),
          limit: vi.fn(async () => ({ data: options.browserProcedures ?? [], error: null })),
        }
        return qb
      }

      if (table === 'agent_ops_browser_procedure_versions') {
        const qb = {
          select: vi.fn(() => qb),
          eq: vi.fn(() => qb),
          order: vi.fn(() => qb),
          limit: vi.fn(() => qb),
          maybeSingle: vi.fn(async () => ({ data: options.browserProcedureVersion ?? null, error: null })),
        }
        return qb
      }

      if (table === 'agent_ops_browser_host_playbooks') {
        const qb = {
          select: vi.fn(() => qb),
          eq: vi.fn(() => qb),
          or: vi.fn(() => qb),
          is: vi.fn(() => qb),
          order: vi.fn(() => qb),
          limit: vi.fn(async () => ({ data: options.browserHostPlaybooks ?? [], error: null })),
        }
        return qb
      }

      return {
        insert: vi.fn(async (payload: unknown) => {
          inserts.push({ table, payload })
          return { error: null }
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    }),
  }

  return { supabase, inserts }
}

describe('AgentOpsDagOrchestrationAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('instantiates a workflow DAG with Agent Ops run context and promotes roots', async () => {
    const { supabase, inserts } = makeSupabase()
    const workflow = getAgentOpsWorkflow('review')
    const uuids = [
      ...Array.from({ length: workflow.steps.length }, (_, index) =>
        `${String(index + 1).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      ),
      DAG_ID,
    ]
    const scheduler = {
      onDagCreated: vi.fn(async () => undefined),
    } as unknown as SchedulerBridge
    const adapter = new AgentOpsDagOrchestrationAdapter({
      supabaseClient: supabase as never,
      scheduler,
      uuid: () => uuids.shift()!,
    })

    const result = await adapter.startDag({
      run: makeRun(),
      workflow,
    })

    expect(result.dagId).toBe(DAG_ID)
    expect(scheduler.onDagCreated).toHaveBeenCalledWith(DAG_ID)
    const nodeInsert = inserts.find((insert) => insert.table === 'orchestration_dag_nodes')
    expect(nodeInsert?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtime_target: 'dedicated',
          payload: expect.objectContaining({
            agent_ops: expect.objectContaining({
              run_id: RUN_ID,
              org_id: ORG_ID,
              project_id: PROJECT_ID,
              assistant_id: AGENT_ID,
              workflow_id: 'review',
              scope: expect.objectContaining({ ref: 'pr-7' }),
              input: { target: 'pr-7' },
              decision_pacing: expect.objectContaining({
                event_table: 'agent_ops_decision_events',
                policy: expect.objectContaining({
                  flip_supported: true,
                  one_way_always_ask: true,
                }),
              }),
            }),
          }),
        }),
      ]),
    )
  })

  it('targets shared DAG execution when runtime selection only found shared workers', async () => {
    const { supabase, inserts } = makeSupabase()
    const workflow = getAgentOpsWorkflow('check-page')
    const uuids = [
      ...Array.from({ length: workflow.steps.length }, (_, index) =>
        `${String(index + 1).padStart(8, '0')}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
      ),
      DAG_ID,
    ]
    const adapter = new AgentOpsDagOrchestrationAdapter({
      supabaseClient: supabase as never,
      scheduler: { onDagCreated: vi.fn(async () => undefined) } as unknown as SchedulerBridge,
      uuid: () => uuids.shift()!,
    })

    await adapter.startDag({
      run: makeRun({
        workflowId: 'check-page',
        metadata: {
          team_ops: {
            compatibleRuntimeProfiles: ['shared'],
            partialRuntimeProfiles: ['shared'],
          },
        },
      }),
      workflow,
    })

    const nodeInsert = inserts.find((insert) => insert.table === 'orchestration_dag_nodes')
    expect(nodeInsert?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtime_target: 'shared',
        }),
      ]),
    )
  })

  it('attaches a matched active Browser Operator procedure to browser DAG payloads', async () => {
    const { supabase, inserts } = makeSupabase({
      browserProcedures: [
        {
          id: 'procedure-1',
          org_id: ORG_ID,
          project_id: PROJECT_ID,
          host_pattern: 'app.example.com',
          name: 'Dashboard smoke',
          slug: 'dashboard-smoke',
          description: 'Open the dashboard and collect release evidence.',
          intent_triggers: ['dashboard', 'check-page'],
          procedure_type: 'browser_operator_plan',
          scope: 'project',
          trust_state: 'active',
          source_run_id: null,
          created_by_user_id: null,
          created_by_agent_id: null,
          metadata: {},
          created_at: '2026-05-02T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
      ],
      browserProcedureVersion: {
        id: 'version-1',
        procedure_id: 'procedure-1',
        version: 3,
        definition_kind: 'browser_operator_plan',
        definition: {
          schema_version: 1,
          steps: [
            { id: 'open', action: 'navigate', target_url: 'https://app.example.com/dashboard' },
            { id: 'observe', action: 'observe' },
          ],
        },
        fixture_artifact_id: null,
        test_definition: {},
        capabilities: ['browser:navigate', 'browser:observe'],
        risk_level: 'medium',
        approval_policy: {},
        content_hash: 'hash-1',
        created_at: '2026-05-02T00:00:00.000Z',
      },
      browserHostPlaybooks: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          org_id: ORG_ID,
          project_id: PROJECT_ID,
          host_pattern: 'app.example.com',
          title: 'Dashboard host notes',
          body_md: 'Use the dashboard smoke path and avoid destructive account changes.',
          scope: 'project',
          trust_state: 'active',
          successful_uses: 4,
          security_flags_count: 0,
          last_used_at: null,
          source_run_id: null,
          created_by_user_id: null,
          created_by_agent_id: null,
          metadata: {},
          created_at: '2026-05-02T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
      ],
    })
    const workflow = getAgentOpsWorkflow('check-page')
    const uuids = [
      ...Array.from({ length: workflow.steps.length }, (_, index) =>
        `${String(index + 1).padStart(8, '0')}-cccc-4ccc-8ccc-cccccccccccc`,
      ),
      DAG_ID,
    ]
    const adapter = new AgentOpsDagOrchestrationAdapter({
      supabaseClient: supabase as never,
      scheduler: { onDagCreated: vi.fn(async () => undefined) } as unknown as SchedulerBridge,
      uuid: () => uuids.shift()!,
    })

    await adapter.startDag({
      run: makeRun({
        workflowId: 'check-page',
        input: {
          target: 'https://app.example.com/dashboard',
          scenario: 'Check the dashboard release page.',
        },
        scope: {
          type: 'url',
          ref: 'https://app.example.com/dashboard',
          label: 'Dashboard release page',
          metadata: {},
        },
      }),
      workflow,
    })

    const nodeInsert = inserts.find((insert) => insert.table === 'orchestration_dag_nodes')
    expect(nodeInsert?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            agent_ops: expect.objectContaining({
              workflow_id: 'check-page',
              browser_procedure: expect.objectContaining({
                id: 'procedure-1',
                name: 'Dashboard smoke',
                trust_state: 'active',
                version: expect.objectContaining({
                  id: 'version-1',
                  version: 3,
                  definition_kind: 'browser_operator_plan',
                }),
              }),
              browser_host_playbooks: [
                expect.objectContaining({
                  id: '99999999-9999-4999-8999-999999999999',
                  title: 'Dashboard host notes',
                  trust_state: 'active',
                }),
              ],
              browser_trust_shield: expect.objectContaining({
                state: 'protected',
                low_level_action_policy: 'deny_by_default',
                canaries: [
                  expect.objectContaining({
                    token: expect.stringMatching(/^lucid_canary_/),
                    tokenHash: expect.any(String),
                    label: 'browser-trust-shield',
                  }),
                ],
              }),
              security_canaries: [
                expect.objectContaining({
                  token: expect.stringMatching(/^lucid_canary_/),
                  tokenHash: expect.any(String),
                }),
              ],
              browser_live_session: expect.objectContaining({
                schema_version: 1,
                event_stream: 'agent_ops_browser_session_events',
                resume_policy: 'human_resolves_then_agent_resumes',
              }),
              browser_session_sharing: expect.objectContaining({
                schema_version: 1,
                token_table: 'agent_ops_browser_session_shares',
                action_table: 'agent_ops_browser_session_actions',
                isolation: 'per_agent_tab',
                attribution_required: true,
              }),
            }),
          }),
        }),
      ]),
    )
  })

  it('rejects DAG starts without an assistant execution owner', async () => {
    const { supabase } = makeSupabase()
    const adapter = new AgentOpsDagOrchestrationAdapter({
      supabaseClient: supabase as never,
      scheduler: { onDagCreated: vi.fn() } as unknown as SchedulerBridge,
    })

    await expect(
      adapter.startDag({
        run: makeRun({ assistantId: null }),
        workflow: getAgentOpsWorkflow('review'),
      }),
    ).rejects.toThrow(/assistant_id/)
  })
})
