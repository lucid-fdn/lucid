import { performance } from 'node:perf_hooks'

import { describe, expect, it, vi } from 'vitest'

import {
  buildBrowserQaSessionKey,
  normalizeBrowserQaArtifactContent,
  resolveBrowserQaTargetUrl,
} from '../browser-qa'
import {
  buildAgentOpsPerformanceAlert,
  buildAgentOpsPerformanceAlertHistory,
  evaluateAgentOpsPerformanceAlertDecision,
  evaluateAgentOpsPerformanceHealth,
} from '../operating-loop'
import { startAgentOpsRun } from '../start'
import type { AgentOpsRunStore } from '../ports'
import type {
  AgentOpsRun,
  AgentOpsRunStatus,
  AgentOpsWorkflowDefinition,
  AgentOpsWorkflowId,
  StartAgentOpsRunInput,
} from '../workflow-types'

const orgId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const assistantId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'

const scenarios: Array<{
  workflowId: AgentOpsWorkflowId
  scope: StartAgentOpsRunInput['scope']
  input: Record<string, unknown>
}> = [
  {
    workflowId: 'investigate',
    scope: { type: 'incident', ref: 'incident-latency-regression', metadata: {} },
    input: { target: 'Investigate latency regression from production logs.' },
  },
  {
    workflowId: 'review',
    scope: { type: 'pull_request', ref: 'pr-42', metadata: {} },
    input: { target: 'pr-42', focus: 'correctness, security, tests' },
  },
  {
    workflowId: 'qa',
    scope: { type: 'url', ref: 'https://preview.example.com/dashboard', metadata: {} },
    input: { target: 'https://preview.example.com/dashboard', scenario: 'Smoke dashboard load.' },
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
    input: { target: 'lucid repository trust boundaries' },
  },
  {
    workflowId: 'model-benchmark',
    scope: { type: 'project', ref: 'lucid', metadata: {} },
    input: { scenario: 'Review a security-sensitive PR.', models: 'gpt-4.1,gpt-4.1-mini' },
  },
]

describe('Agent Ops stress and latency gates', () => {
  it('keeps repeated Agent Ops launches on the shared runtime path within the local budget', async () => {
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
          summary: `${workflow.name} completed in stress simulation.`,
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

    const launchLatencies: number[] = []
    const repeatedScenarios = repeat(scenarios, 8)

    for (const [index, scenario] of repeatedScenarios.entries()) {
      const startedAt = performance.now()
      const run = await startAgentOpsRun({
        orgId,
        projectId,
        assistantId,
        requestedByUserId: userId,
        workflowId: scenario.workflowId,
        scope: scenario.scope,
        input: scenario.input,
        metadata: { stress_iteration: index },
      }, {
        runStore: store,
        orchestration,
        runtime,
        missionControl,
      })
      launchLatencies.push(performance.now() - startedAt)
      expect(run.status === 'completed' || run.status === 'running').toBe(true)
    }

    const stats = latencyStats(launchLatencies)

    expect(repeatedScenarios).toHaveLength(64)
    expect(missionControl.projectRunStarted).toHaveBeenCalledTimes(64)
    expect(stats.p95Ms).toBeLessThan(100)
    expect(stats.totalMs).toBeLessThan(3_000)
  })

  it('keeps repeated Browser QA session normalization cheap and deterministic', () => {
    const sessionKeys = new Set<string>()
    const latencies: number[] = []

    for (let index = 0; index < 200; index += 1) {
      const runId = `browser-qa-run-${index}`
      const startedAt = performance.now()
      const targetUrl = resolveBrowserQaTargetUrl({
        runId,
        input: {
          deployUrl: `https://preview.example.com/path-${index}?from=stress#discard-me`,
        },
        scope: { ref: 'https://fallback.example.com' },
      })

      expect(targetUrl).toBe(`https://preview.example.com/path-${index}?from=stress`)

      const sessionKey = buildBrowserQaSessionKey({ runId, targetUrl: targetUrl ?? '' })
      const content = normalizeBrowserQaArtifactContent({
        runId,
        targetUrl: targetUrl ?? '',
        capturedAt: '2026-04-30T10:00:00.000Z',
        content: {
          viewport: { width: 1440, height: 900 },
          provider: 'openclaw-compatible',
        },
      })

      sessionKeys.add(sessionKey)
      expect(content.browser_qa).toMatchObject({
        schema_version: 1,
        session_key: sessionKey,
        target_url: targetUrl,
      })
      latencies.push(performance.now() - startedAt)
    }

    const stats = latencyStats(latencies)

    expect(sessionKeys.size).toBe(200)
    expect(stats.p95Ms).toBeLessThan(25)
    expect(stats.totalMs).toBeLessThan(1_000)
  })

  it('keeps repeated alert refresh projections bounded without inventing noisy fanout state', () => {
    const latencies: number[] = []
    const snapshots = Array.from({ length: 250 }, (_, index) => ({
      runCount: 24 + index,
      completedRunCount: 18 + index,
      failedRunCount: 6,
      measuredRunCount: 24 + index,
      avgLatencyMs: 140_000 + index,
      p95LatencyMs: 360_000 + index,
      totalCostUsd: 55 + index / 100,
      avgCostUsd: 0.3,
      totalTokens: 48_000 + index,
      avgTokens: 1_800,
      windowDays: 14,
    }))

    for (const [index, snapshot] of snapshots.entries()) {
      const startedAt = performance.now()
      const health = evaluateAgentOpsPerformanceHealth(snapshot)
      const alert = buildAgentOpsPerformanceAlert({
        orgId,
        projectId,
        assistantId,
        health,
        windowDays: snapshot.windowDays,
      })
      const decision = evaluateAgentOpsPerformanceAlertDecision({
        alert,
        now: new Date('2026-04-30T10:00:00.000Z'),
      })
      const history = buildAgentOpsPerformanceAlertHistory({
        events: alert ? [{
          id: `alert-${index}`,
          title: alert.title,
          body: alert.body,
          evidence: alert.evidence,
          metadata: alert.metadata,
          createdAt: '2026-04-30T10:00:00.000Z',
        }] : [],
      })

      expect(health.status === 'watch' || health.status === 'breach').toBe(true)
      expect(alert).not.toBeNull()
      expect(decision.shouldRecord).toBe(true)
      expect(history).toHaveLength(1)
      latencies.push(performance.now() - startedAt)
    }

    const stats = latencyStats(latencies)

    expect(stats.p95Ms).toBeLessThan(25)
    expect(stats.totalMs).toBeLessThan(1_000)
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

function repeat<T>(items: T[], times: number): T[] {
  return Array.from({ length: times }).flatMap(() => items)
}

function latencyStats(samples: number[]): { p95Ms: number; totalMs: number } {
  const sorted = [...samples].sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return {
    p95Ms: sorted[p95Index] ?? 0,
    totalMs: samples.reduce((sum, value) => sum + value, 0),
  }
}
