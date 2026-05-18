import { describe, expect, it, vi } from 'vitest'

import { startAgentOpsRun } from '../start'
import { buildAgentOpsDagSpec } from '../workflow-to-dag'
import { getAgentOpsWorkflow } from '../workflow-registry'
import type {
  AgentOpsRun,
  AgentOpsRunStatus,
  AgentOpsWorkflowDefinition,
  AgentOpsWorkflowId,
  StartAgentOpsRunInput,
} from '../workflow-types'
import type { AgentOpsRunStore } from '../ports'

const orgId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const assistantId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'

const initialPlanWorkflows: Array<{
  workflowId: AgentOpsWorkflowId
  scope: StartAgentOpsRunInput['scope']
  input: Record<string, unknown>
}> = [
  {
    workflowId: 'investigate',
    scope: { type: 'incident', ref: 'incident-latency-regression', metadata: {} },
    input: { target: 'Investigate API latency regression from production logs.' },
  },
  {
    workflowId: 'review',
    scope: { type: 'pull_request', ref: 'pr-42', metadata: {} },
    input: { target: 'pr-42', focus: 'correctness, security, and tests' },
  },
  {
    workflowId: 'qa',
    scope: { type: 'url', ref: 'https://app.example.com/dashboard', metadata: {} },
    input: { target: 'https://app.example.com/dashboard', scenario: 'Smoke dashboard load and navigation.' },
  },
  {
    workflowId: 'ship',
    scope: { type: 'branch', ref: 'release/agent-ops', metadata: {} },
    input: { target: 'release/agent-ops', deployUrl: 'https://preview.example.com' },
  },
  {
    workflowId: 'canary',
    scope: { type: 'deploy', ref: 'https://preview.example.com', metadata: {} },
    input: { deployUrl: 'https://preview.example.com' },
  },
  {
    workflowId: 'retro',
    scope: { type: 'run', ref: 'agent-ops-run-42', metadata: {} },
    input: { target: 'agent-ops-run-42' },
  },
  {
    workflowId: 'security-audit',
    scope: { type: 'repository', ref: 'lucid', metadata: {} },
    input: { target: 'lucid repository and runtime trust boundaries' },
  },
  {
    workflowId: 'model-benchmark',
    scope: { type: 'project', ref: 'lucid', metadata: {} },
    input: { scenario: 'Review a security-sensitive PR with structured findings.', models: 'gpt-4.1, gpt-4.1-mini' },
  },
]

describe('Agent Ops initial plan E2E readiness', () => {
  it('launches every initial-plan workflow through the correct product runtime path', async () => {
    const store = new InMemoryAgentOpsRunStore()
    const orchestration = {
      startDag: vi.fn(async ({ workflow }: { run: AgentOpsRun; workflow: AgentOpsWorkflowDefinition }) => ({
        dagId: `dag-${workflow.id}`,
      })),
      cancelDag: vi.fn(),
      retryDag: vi.fn(),
    }
    const runtime = {
      startSingleRun: vi.fn(async ({ workflow }: { run: AgentOpsRun; workflow: AgentOpsWorkflowDefinition }) => ({
        agentRunId: `agent-run-${workflow.id}`,
        output: {
          summary: `${workflow.name} completed in E2E simulation.`,
          findings: [],
          evidence: workflow.evidenceTypes.map((type) => ({ type, simulated: true })),
          risks: [],
          next_actions: [],
        },
      })),
    }
    const missionControl = {
      projectRunStarted: vi.fn(async () => {}),
      projectRunUpdated: vi.fn(async () => {}),
    }

    const results = await Promise.all(initialPlanWorkflows.map((scenario) =>
      startAgentOpsRun({
        orgId,
        projectId,
        assistantId,
        requestedByUserId: userId,
        workflowId: scenario.workflowId,
        scope: scenario.scope,
        input: scenario.input,
        metadata: { e2e_readiness: true },
      }, {
        runStore: store,
        orchestration,
        runtime,
        missionControl,
      }),
    ))

    expect(results.map((run) => run.workflowId)).toEqual(initialPlanWorkflows.map((scenario) => scenario.workflowId))
    expect(results.every((run) => run.status === 'completed' || run.status === 'running')).toBe(true)

    const dagWorkflows = initialPlanWorkflows
      .map((scenario) => getAgentOpsWorkflow(scenario.workflowId))
      .filter((workflow) => workflow.executionMode === 'dag')
    const singleRunWorkflows = initialPlanWorkflows
      .map((scenario) => getAgentOpsWorkflow(scenario.workflowId))
      .filter((workflow) => workflow.executionMode === 'single_run')

    expect(orchestration.startDag).toHaveBeenCalledTimes(dagWorkflows.length)
    expect(runtime.startSingleRun).toHaveBeenCalledTimes(singleRunWorkflows.length)
    expect(missionControl.projectRunStarted).toHaveBeenCalledTimes(initialPlanWorkflows.length)
    expect(results.find((run) => run.workflowId === 'ship')).toMatchObject({
      status: 'running',
      orchestrationDagId: 'dag-ship',
    })
    expect(results.find((run) => run.workflowId === 'investigate')).toMatchObject({
      status: 'completed',
      metadata: { agentRunId: 'agent-run-investigate' },
    })
  })

  it('compiles every DAG-backed initial-plan workflow into executable, evidence-aware DAG specs', () => {
    for (const scenario of initialPlanWorkflows) {
      const workflow = getAgentOpsWorkflow(scenario.workflowId)
      expect(workflow.outputSections).toEqual(['summary', 'findings', 'evidence', 'risks', 'next_actions'])
      expect(workflow.evidenceTypes.length).toBeGreaterThan(0)

      if (workflow.executionMode !== 'dag') continue

      const spec = buildAgentOpsDagSpec(workflow)
      expect(spec.nodes.length).toBe(workflow.steps.length)
      expect(spec.nodes.every((node) => node.payload?.agent_ops)).toBe(true)
      expect(spec.metadata?.agent_ops).toMatchObject({
        workflow_id: workflow.id,
        workflow_version: workflow.version,
        output_sections: workflow.outputSections,
        evidence_types: workflow.evidenceTypes,
      })
      expect(spec.nodes.at(-1)?.payload?.agent_ops).toMatchObject({
        workflow_id: workflow.id,
        workflow_version: workflow.version,
      })
    }
  })
})

class InMemoryAgentOpsRunStore implements AgentOpsRunStore {
  private readonly runs = new Map<string, AgentOpsRun>()
  private counter = 0

  async createRun(input: Parameters<AgentOpsRunStore['createRun']>[0]): Promise<AgentOpsRun> {
    this.counter += 1
    const now = '2026-04-30T00:00:00.000Z'
    const run: AgentOpsRun = {
      id: `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`,
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      assistantId: input.assistantId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      workflowId: input.workflow.id,
      workflowVersion: input.workflow.version,
      status: input.status,
      runMode: input.runMode ?? 'execute',
      scope: input.scope,
      input: input.input ?? {},
      output: null,
      agentRunIds: [],
      orchestrationDagId: null,
      rootAgentRunId: null,
      humanWorkItemIds: [],
      approvalIds: [],
      artifactCount: 0,
      findingCount: 0,
      latencyMs: null,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    }
    this.runs.set(run.id, run)
    return run
  }

  async getRun(runId: string): Promise<AgentOpsRun | null> {
    return this.runs.get(runId) ?? null
  }

  async updateRunStatus(input: Parameters<AgentOpsRunStore['updateRunStatus']>[0]): Promise<AgentOpsRun> {
    const current = this.runs.get(input.runId)
    if (!current || current.orgId !== input.orgId) throw new Error('run not found')
    const updated: AgentOpsRun = {
      ...current,
      status: input.status as AgentOpsRunStatus,
      errorMessage: input.errorMessage ?? current.errorMessage,
      orchestrationDagId: input.orchestrationDagId ?? current.orchestrationDagId,
      rootAgentRunId: input.rootAgentRunId ?? current.rootAgentRunId,
      output: input.output ?? current.output,
      metadata: input.metadata ? { ...current.metadata, ...input.metadata } : current.metadata,
      completedAt: input.status === 'completed' ? '2026-04-30T00:01:00.000Z' : current.completedAt,
      updatedAt: '2026-04-30T00:01:00.000Z',
    }
    this.runs.set(updated.id, updated)
    return updated
  }
}
