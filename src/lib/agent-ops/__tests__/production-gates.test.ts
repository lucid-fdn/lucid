import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { formatAgentOpsChannelLaunchReport } from '../channel-native'
import { startAgentOpsRun } from '../start'
import type {
  AgentOpsRunStore,
} from '../ports'
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

describe('Agent Ops production gates', () => {
  it('blocks policy-gated launch before runtime dispatch and reports it to channels', async () => {
    const store = new InMemoryAgentOpsRunStore()
    const runtimeSelector = { listCandidates: vi.fn(async () => [{ profileId: 'shared' as const }]) }
    const run = await startAgentOpsRun(
      buildRunInput('ship', { type: 'branch', ref: 'release/agent-ops', metadata: {} }),
      {
        runStore: store,
        runtimeSelector,
        teamPolicyGate: {
          evaluateRunStart: vi.fn(async () => ({
            allowed: false,
            enforced: true,
            targetGates: ['ship', 'deploy'],
            required: [missingRequirement('review', 'required')],
            recommended: [],
            optional: [],
            missingRequired: [missingRequirement('review', 'required')],
            summary: 'Missing required review evidence.',
          })),
        },
      },
    )

    const report = formatAgentOpsChannelLaunchReport({ run, channelLabel: 'Discord' })

    expect(run.status).toBe('blocked')
    expect(run.metadata.team_policy_gate).toMatchObject({ allowed: false })
    expect(run.metadata.team_ops).toMatchObject({
      adaptiveDispatch: expect.objectContaining({
        finalTier: 'full',
        policySignals: expect.arrayContaining([
          expect.stringContaining('Required workflow evidence'),
        ]),
      }),
    })
    expect(runtimeSelector.listCandidates).not.toHaveBeenCalled()
    expect(report).toContain('Discord Agent Ops run blocked')
    expect(report).toContain('Blocked reason: Agent Ops team policy blocked this run')
  })

  it('blocks incompatible runtime launch without losing adaptive dispatch and channel report state', async () => {
    const store = new InMemoryAgentOpsRunStore()
    const run = await startAgentOpsRun(
      buildRunInput('review', { type: 'pull_request', ref: 'pr-42', metadata: {} }),
      {
        runStore: store,
        runtimeSelector: {
          listCandidates: vi.fn(async () => [
            { profileId: 'c2a_autonomous' as const, engine: 'lucid' as const, label: 'Lucid C2A' },
          ]),
        },
        specialistTelemetry: {
          list: vi.fn(async () => [specialistTelemetry('testing', 'Testing Reviewer', 'testing', 'needs_tuning')]),
        },
      },
    )

    const teamOps = readRecord(run.metadata.team_ops)
    const report = formatAgentOpsChannelLaunchReport({ run, channelLabel: 'Telegram' })

    expect(run.status).toBe('blocked')
    expect(run.metadata.runtime_selection).toMatchObject({
      blocked: true,
      candidate_count: 1,
      missing_capabilities: ['runtime:lucid'],
    })
    expect(teamOps.adaptiveDispatch).toMatchObject({
      skippedSpecialists: [expect.objectContaining({ slug: 'testing' })],
      protectedSpecialists: [expect.objectContaining({ slug: 'security' })],
    })
    expect(report).toContain('Telegram Agent Ops run blocked')
    expect(report).toContain('Adaptive dispatch:')
    expect(report).toContain('Skipped specialists: Testing Reviewer')
    expect(report).toContain('Protected specialists: Security Reviewer')
  })

  it('keeps adaptive dispatch, runtime compatibility, and Mission Control display projections together on launch', async () => {
    const store = new InMemoryAgentOpsRunStore()
    const missionControl = {
      projectRunStarted: vi.fn(async () => {}),
      projectRunUpdated: vi.fn(async () => {}),
    }
    const orchestration = {
      startDag: vi.fn(async ({ workflow }: { run: AgentOpsRun; workflow: AgentOpsWorkflowDefinition }) => ({
        dagId: `dag-${workflow.id}`,
      })),
      cancelDag: vi.fn(),
      retryDag: vi.fn(),
    }

    const run = await startAgentOpsRun(
      buildRunInput('review', { type: 'pull_request', ref: 'pr-42', metadata: {} }),
      {
        runStore: store,
        orchestration,
        missionControl,
        runtimeSelector: {
          listCandidates: vi.fn(async () => [
            { profileId: 'shared' as const, engine: 'lucid' as const, label: 'Shared Runtime' },
          ]),
        },
        specialistTelemetry: {
          list: vi.fn(async () => [
            specialistTelemetry('testing', 'Testing Reviewer', 'testing', 'needs_tuning'),
            specialistTelemetry('security', 'Security Reviewer', 'security', 'needs_tuning', true),
          ]),
        },
      },
    )

    const teamOps = readRecord(run.metadata.team_ops)
    const source = readFileSync(
      join(process.cwd(), 'src/app/(app)/[workspace-slug]/mission-control/agent-ops/agent-ops-client.tsx'),
      'utf8',
    )

    expect(run.status).toBe('running')
    expect(teamOps).toMatchObject({
      dispatchTier: 'heavy',
      compatibleRuntimeProfiles: ['shared'],
      adaptiveDispatch: expect.objectContaining({
        baseTier: 'heavy',
        finalTier: 'heavy',
        skippedSpecialists: [expect.objectContaining({ slug: 'testing' })],
        protectedSpecialists: [expect.objectContaining({ slug: 'security' })],
      }),
    })
    expect(readArray(teamOps.specialists).map((specialist) => readRecord(specialist).slug)).toContain('security')
    expect(readArray(teamOps.specialists).map((specialist) => readRecord(specialist).slug)).not.toContain('testing')
    expect(missionControl.projectRunStarted).toHaveBeenCalledOnce()
    expect(source).toContain('Adaptive dispatch')
    expect(source).toContain('Protected specialists')
    expect(source).toContain('Skipped for tuning')
  })
})

function buildRunInput(
  workflowId: AgentOpsWorkflowId,
  scope: StartAgentOpsRunInput['scope'],
): StartAgentOpsRunInput {
  return {
    orgId,
    projectId,
    assistantId,
    requestedByUserId: userId,
    workflowId,
    scope,
    input: { target: scope.ref ?? workflowId },
    metadata: { production_gate: true },
  }
}

function missingRequirement(
  workflowId: AgentOpsWorkflowId,
  level: 'required' | 'recommended' | 'optional',
) {
  return {
    workflowId,
    level,
    gateTargets: ['ship' as const],
    freshnessHours: 168,
    satisfied: false,
    lastRunId: null,
    lastRunAt: null,
    reason: `No completed ${workflowId} run found.`,
  }
}

function specialistTelemetry(
  slug: string,
  name: string,
  category: string,
  signal: 'high_value' | 'watch' | 'needs_tuning' | 'insufficient_data',
  critical = false,
) {
  return {
    slug,
    name,
    category: category as never,
    critical,
    selectedCount: 8,
    runCount: 8,
    completedRunCount: 8,
    failedRunCount: 0,
    blockedRunCount: 0,
    findingCount: signal === 'high_value' ? 4 : 0,
    openCount: 0,
    acceptedCount: signal === 'high_value' ? 4 : 0,
    fixedCount: 0,
    dismissedCount: 0,
    needsInfoCount: 0,
    usefulFindingCount: signal === 'high_value' ? 4 : 0,
    falsePositiveCount: 0,
    criticalFindingCount: 0,
    highSeverityFindingCount: 0,
    avgConfidence: null,
    usefulnessRate: signal === 'high_value' ? 100 : null,
    avgLatencyMs: null,
    totalCostUsd: 0,
    totalTokens: 0,
    lastSeenAt: '2026-04-30T10:00:00.000Z',
    signal,
    recommendation: signal === 'needs_tuning'
      ? 'Review prompts, evidence scope, or dispatch conditions before expanding usage.'
      : 'Keep this specialist in the dispatch plan.',
  }
}

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
      errorMessage: input.errorMessage ?? null,
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
