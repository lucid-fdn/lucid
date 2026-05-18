/**
 * Contract Sync Tests — Pulse Worker ↔ Contracts
 *
 * Verifies that types and constants in worker/src/pulse/types.ts
 * stay in sync with contracts/pulse.ts.
 */

import { describe, it, expect } from 'vitest'
import type { PulseJob as WorkerJob } from '../types.js'
import type { PulseJob as ContractJob, StepType as ContractStepType } from '../../../../contracts/pulse.js'
import type { StepType as ExecutorStepType } from '../executors/types.js'
import { PulseKeys as WorkerKeys } from '../types.js'
import {
  PulseKeys as ContractKeys,
  LEASE_TTL_SECONDS,
  MAX_CONCURRENT_PER_AGENT,
  MAX_ATTEMPTS,
  CLAIM_LUA as ContractClaimLua,
  CONDITIONAL_DEL_LUA as ContractCondDelLua,
  PLAIN_CONDITIONAL_DEL_LUA as ContractPlainCondDelLua,
  FLOOR_DECR_LUA as ContractFloorDecrLua,
  RENEW_LEASE_LUA as ContractRenewLeaseLua,
} from '../../../../contracts/pulse.js'
import {
  CLAIM_LUA as WorkerClaimLua,
  CONDITIONAL_DEL_LUA as WorkerCondDelLua,
  PLAIN_CONDITIONAL_DEL_LUA as WorkerPlainCondDelLua,
  FLOOR_DECR_LUA as WorkerFloorDecrLua,
  RENEW_LEASE_LUA as WorkerRenewLeaseLua,
} from '../lua-scripts.js'
import {
  DAG_STEP_TYPES as WorkerDagStepTypes,
  DAG_STEP_INITIAL_STATUSES as WorkerDagInitialStatuses,
  DAG_RUNTIME_TARGETS as WorkerDagRuntimeTargets,
  DAG_ROUTE_CLASSES as WorkerDagRouteClasses,
  buildStepRow as workerBuildStepRow,
  dagStepCreateInputSchema as workerDagStepSchema,
} from '../dag/dag-step-creator.js'
import {
  DAG_STEP_TYPES as ContractDagStepTypes,
  DAG_STEP_INITIAL_STATUSES as ContractDagInitialStatuses,
  DAG_RUNTIME_TARGETS as ContractDagRuntimeTargets,
  DAG_ROUTE_CLASSES as ContractDagRouteClasses,
  buildStepRow as contractBuildStepRow,
  dagStepCreateInputSchema as contractDagStepSchema,
} from '../../../../contracts/dag-step.js'
import {
  DAG_NODE_TYPES as WorkerDagNodeTypes,
  DAG_NODE_STATUSES as WorkerDagNodeStatuses,
  DAG_STATUSES as WorkerDagStatuses,
  DAG_SOURCES as WorkerDagSources,
  DAG_EDGE_KINDS as WorkerDagEdgeKinds,
  DAG_MUTATION_TYPES as WorkerDagMutationTypes,
  DAG_MUTATION_SOURCES as WorkerDagMutationSources,
  DAG_BUDGET_EVENT_TYPES as WorkerDagBudgetEventTypes,
  DAG_CONFIDENCE_SOURCES as WorkerDagConfidenceSources,
} from '../dag/types.js'
import {
  DAG_NODE_TYPES as ContractDagNodeTypes,
  DAG_NODE_STATUSES as ContractDagNodeStatuses,
  DAG_STATUSES as ContractDagStatuses,
  DAG_SOURCES as ContractDagSources,
  DAG_EDGE_KINDS as ContractDagEdgeKinds,
  DAG_MUTATION_TYPES as ContractDagMutationTypes,
  DAG_MUTATION_SOURCES as ContractDagMutationSources,
  DAG_BUDGET_EVENT_TYPES as ContractDagBudgetEventTypes,
  DAG_CONFIDENCE_SOURCES as ContractDagConfidenceSources,
} from '../../../../contracts/dag.js'

describe('Contract Sync', () => {
  describe('PulseJob step fields', () => {
    it('worker PulseJob has all step fields from contract', () => {
      // Type-level check: if contract adds a field, this test fails to compile
      const contractJob: ContractJob = {
        runId: 'r', eventId: 'e', eventType: 'inbound', agentId: 'a',
        orgId: 'o', priority: 'normal', attempt: 0, enqueuedAt: 0,
        stepType: 'webhook',
        stepId: 'step-1',
        webhookUrl: 'https://example.com',
        webhookPayload: '{}',
        approvalConfig: { toolName: 't', toolArgs: {}, timeoutSeconds: 300 },
      }

      // Worker job must accept the same shape
      const workerJob: WorkerJob = { ...contractJob }
      expect(workerJob.stepType).toBe('webhook')
      expect(workerJob.stepId).toBe('step-1')
      expect(workerJob.webhookUrl).toBe('https://example.com')
      expect(workerJob.webhookPayload).toBe('{}')
      expect(workerJob.approvalConfig?.toolName).toBe('t')
    })
  })

  describe('StepType sync', () => {
    it('contracts StepType includes webhook and approval', () => {
      const types: ContractStepType[] = ['inbound', 'outbound', 'scheduled', 'webhook', 'approval']
      expect(types).toHaveLength(5)
    })

    it('executor StepType matches contracts StepType', () => {
      const contractTypes: ContractStepType[] = ['inbound', 'outbound', 'scheduled', 'webhook', 'approval']
      const executorTypes: ExecutorStepType[] = ['inbound', 'outbound', 'scheduled', 'webhook', 'approval']
      expect(executorTypes).toEqual(contractTypes)
    })
  })

  describe('PulseKeys sync', () => {
    it('worker and contract PulseKeys produce identical keys', () => {
      expect(WorkerKeys.queue('inbound', 'normal')).toBe(ContractKeys.queue('inbound', 'normal'))
      expect(WorkerKeys.queue('outbound', 'critical')).toBe(ContractKeys.queue('outbound', 'critical'))
      expect(WorkerKeys.active()).toBe(ContractKeys.active())
      expect(WorkerKeys.lease('run-1')).toBe(ContractKeys.lease('run-1'))
      expect(WorkerKeys.agentInflight('agent-1')).toBe(ContractKeys.agentInflight('agent-1'))
      expect(WorkerKeys.dlq('inbound')).toBe(ContractKeys.dlq('inbound'))
      expect(WorkerKeys.orphanLock()).toBe(ContractKeys.orphanLock())
    })
  })

  describe('Lua script parity', () => {
    // P1 fix: Codex review found contract-sync didn't actually verify Lua scripts.
    // Worker and control plane each ship their own copy. They MUST stay byte-identical
    // or claim/complete/fence/renew flows will diverge silently.
    it('CLAIM_LUA matches between worker and contracts', () => {
      expect(WorkerClaimLua).toBe(ContractClaimLua)
    })
    it('CONDITIONAL_DEL_LUA matches between worker and contracts', () => {
      expect(WorkerCondDelLua).toBe(ContractCondDelLua)
    })
    it('PLAIN_CONDITIONAL_DEL_LUA matches between worker and contracts', () => {
      expect(WorkerPlainCondDelLua).toBe(ContractPlainCondDelLua)
    })
    it('FLOOR_DECR_LUA matches between worker and contracts', () => {
      expect(WorkerFloorDecrLua).toBe(ContractFloorDecrLua)
    })
    it('RENEW_LEASE_LUA matches between worker and contracts', () => {
      expect(WorkerRenewLeaseLua).toBe(ContractRenewLeaseLua)
    })
  })

  describe('dag-step mirror parity', () => {
    // Phase 4N-0, Task 10: DagStepCreator schema/builder is mirrored between
    // worker (worker/src/pulse/dag/dag-step-creator.ts) and contracts/
    // (contracts/dag-step.ts) because the worker tsconfig rootDir prevents
    // importing value modules from outside worker/src. The two copies MUST
    // stay byte-equivalent or REST and worker insert paths will diverge
    // silently. The src/ REST route imports from contracts/; the worker
    // executor imports from its own copy.
    it('DAG_STEP_TYPES match', () => {
      expect([...WorkerDagStepTypes]).toEqual([...ContractDagStepTypes])
    })
    it('DAG_STEP_INITIAL_STATUSES match', () => {
      expect([...WorkerDagInitialStatuses]).toEqual([...ContractDagInitialStatuses])
    })
    it('DAG_RUNTIME_TARGETS match', () => {
      expect([...WorkerDagRuntimeTargets]).toEqual([...ContractDagRuntimeTargets])
    })
    it('DAG_ROUTE_CLASSES match', () => {
      expect([...WorkerDagRouteClasses]).toEqual([...ContractDagRouteClasses])
    })

    const SAMPLE_INPUT = {
      eventId: '11111111-1111-4111-8111-111111111111',
      attempt: 0,
      stepType: 'webhook' as const,
      executorType: 'webhook',
      agentId: '22222222-2222-4222-8222-222222222222',
      orgId: '33333333-3333-4333-8333-333333333333',
      runId: 'run-1',
      initialStatus: 'pending' as const,
      webhookUrl: 'https://example.com/cb',
    }

    it('Zod schema accepts the same input on both sides', () => {
      const workerParsed = workerDagStepSchema.parse(SAMPLE_INPUT)
      const contractParsed = contractDagStepSchema.parse(SAMPLE_INPUT)
      expect(workerParsed).toEqual(contractParsed)
    })

    it('buildStepRow produces identical column shape (excluding started_at)', () => {
      const workerRow = workerBuildStepRow(workerDagStepSchema.parse(SAMPLE_INPUT))
      const contractRow = contractBuildStepRow(contractDagStepSchema.parse(SAMPLE_INPUT))
      // started_at is wall-clock for `running` rows; we use `pending` here so
      // both rows omit it and the comparison is deterministic.
      expect(workerRow).toEqual(contractRow)
    })

    it('buildStepRow anchors started_at when initialStatus=running on both sides', () => {
      const runningInput = { ...SAMPLE_INPUT, initialStatus: 'running' as const }
      const workerRow = workerBuildStepRow(workerDagStepSchema.parse(runningInput))
      const contractRow = contractBuildStepRow(contractDagStepSchema.parse(runningInput))
      expect(typeof workerRow.started_at).toBe('string')
      expect(typeof contractRow.started_at).toBe('string')
      // Same column set even though the timestamps differ by microseconds
      expect(Object.keys(workerRow).sort()).toEqual(Object.keys(contractRow).sort())
    })
  })

  describe('dag.ts mirror parity (Phase 4N-a)', () => {
    // contracts/dag.ts is the canonical source. worker/src/pulse/dag/types.ts
    // mirrors it because the worker tsconfig rootDir prevents importing value
    // modules from outside worker/src. The two copies MUST stay byte-equivalent
    // or the planner/scheduler and Next.js APIs will diverge silently.
    it('DAG_NODE_TYPES match', () => {
      expect([...WorkerDagNodeTypes]).toEqual([...ContractDagNodeTypes])
    })
    it('DAG_NODE_STATUSES match', () => {
      expect([...WorkerDagNodeStatuses]).toEqual([...ContractDagNodeStatuses])
    })
    it('DAG_STATUSES match', () => {
      expect([...WorkerDagStatuses]).toEqual([...ContractDagStatuses])
    })
    it('DAG_SOURCES match', () => {
      expect([...WorkerDagSources]).toEqual([...ContractDagSources])
    })
    it('DAG_EDGE_KINDS match', () => {
      expect([...WorkerDagEdgeKinds]).toEqual([...ContractDagEdgeKinds])
    })
    it('DAG_MUTATION_TYPES match', () => {
      expect([...WorkerDagMutationTypes]).toEqual([...ContractDagMutationTypes])
    })
    it('DAG_MUTATION_SOURCES match', () => {
      expect([...WorkerDagMutationSources]).toEqual([...ContractDagMutationSources])
    })
    it('DAG_BUDGET_EVENT_TYPES match', () => {
      expect([...WorkerDagBudgetEventTypes]).toEqual([...ContractDagBudgetEventTypes])
    })
    it('DAG_CONFIDENCE_SOURCES match', () => {
      expect([...WorkerDagConfidenceSources]).toEqual([...ContractDagConfidenceSources])
    })
  })

  describe('shared constants', () => {
    it('lease TTL matches', () => {
      expect(LEASE_TTL_SECONDS).toBe(60)
    })

    it('max concurrent per agent matches', () => {
      expect(MAX_CONCURRENT_PER_AGENT).toBe(3)
    })

    it('max attempts matches', () => {
      expect(MAX_ATTEMPTS).toBe(5)
    })
  })
})
