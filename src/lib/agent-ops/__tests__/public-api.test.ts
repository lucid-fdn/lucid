import { describe, expect, it, vi } from 'vitest'

import {
  appendAgentOpsArtifact,
  appendAgentOpsFinding,
  buildFindingFingerprint,
  cancelAgentOpsRun,
  retryAgentOpsRun,
  startAgentOpsRun,
  type AgentOpsDependencies,
  type AgentOpsRun,
} from '..'

const runId = '11111111-1111-4111-8111-111111111111'
const orgId = '22222222-2222-4222-8222-222222222222'
const dagId = '33333333-3333-4333-8333-333333333333'

function makeRun(overrides: Partial<AgentOpsRun> = {}): AgentOpsRun {
  const now = new Date('2026-04-28T00:00:00.000Z').toISOString()
  return {
    id: runId,
    orgId,
    projectId: null,
    assistantId: null,
    requestedByUserId: null,
    workflowId: 'review',
    workflowVersion: '1.0.0',
    status: 'queued',
    runMode: 'execute',
    scope: { type: 'project', ref: 'lucid', metadata: {} },
    input: {},
    output: null,
    agentRunIds: [],
    orchestrationDagId: null,
    humanWorkItemIds: [],
    approvalIds: [],
    artifactCount: 0,
    findingCount: 0,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('Agent Ops public API', () => {
  it('starts DAG workflows through the injected orchestration adapter', async () => {
    const created = makeRun()
    const updated = makeRun({ status: 'running', orchestrationDagId: dagId })
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => created),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(async () => updated),
      },
      orchestration: {
        startDag: vi.fn(async () => ({ dagId })),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: { target: 'pr-1' },
      metadata: {},
    }, dependencies)

    expect(result).toEqual(updated)
    expect(dependencies.orchestration?.startDag).toHaveBeenCalledOnce()
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        team_ops: expect.objectContaining({
          dispatchTier: 'heavy',
          specialists: expect.arrayContaining([
            expect.objectContaining({ slug: 'security' }),
          ]),
          compatibleRuntimeProfiles: expect.arrayContaining(['shared', 'c1_managed']),
        }),
      }),
    }))
    expect(dependencies.runStore.updateRunStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      orchestrationDagId: dagId,
    }))
  })

  it('can queue a DAG run without an orchestration adapter for safe rollout', async () => {
    const created = makeRun()
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => created),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(result.status).toBe('queued')
    expect(dependencies.runStore.updateRunStatus).not.toHaveBeenCalled()
  })

  it('blocks a run before dispatch when runtime selection returns no compatible candidates', async () => {
    const blockedRun = makeRun({
      status: 'blocked',
      errorMessage: 'No compatible runtime is currently available for this Agent Ops workflow.',
      metadata: {
        runtime_selection: { blocked: true, candidate_count: 0 },
        team_ops: { dispatchTier: 'heavy' },
      },
    })
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => blockedRun),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
      orchestration: {
        startDag: vi.fn(async () => ({ dagId })),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
      runtimeSelector: {
        listCandidates: vi.fn(async () => []),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(result.status).toBe('blocked')
    expect(result.errorMessage).toContain('No compatible runtime')
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'blocked',
      errorMessage: expect.stringContaining('No compatible runtime'),
      metadata: expect.objectContaining({
        runtime_selection: expect.objectContaining({
          blocked: true,
          candidate_count: 0,
        }),
        team_ops: expect.objectContaining({
          dispatchTier: 'heavy',
        }),
      }),
    }))
    expect(dependencies.orchestration?.startDag).not.toHaveBeenCalled()
    expect(dependencies.runStore.updateRunStatus).not.toHaveBeenCalled()
  })

  it('adds Work Graph capability requirements to runtime compatibility', async () => {
    const created = makeRun()
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => created),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
      orchestration: {
        startDag: vi.fn(async () => ({ dagId })),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
      runtimeSelector: {
        listCandidates: vi.fn(async () => [{ profileId: 'shared' }]),
      },
    }

    await startAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: {},
      metadata: {
        work_graph: {
          work_item_id: '44444444-4444-4444-8444-444444444444',
          checkout_id: '55555555-5555-4555-8555-555555555555',
          required_capabilities: ['native:kanban'],
          source: 'project_work',
        },
      },
    }, dependencies)

    expect(dependencies.runtimeSelector?.listCandidates).toHaveBeenCalledWith(expect.objectContaining({
      workflow: expect.objectContaining({
        requiredCapabilities: expect.arrayContaining(['native:kanban']),
      }),
    }))
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        work_graph: expect.objectContaining({
          checkout_id: '55555555-5555-4555-8555-555555555555',
        }),
        runtime_selection: expect.objectContaining({
          missing_capabilities: expect.arrayContaining(['native:kanban']),
        }),
      }),
      status: 'blocked',
    }))
  })

  it('blocks a gated workflow before runtime selection when required team policy evidence is missing', async () => {
    const blockedRun = makeRun({
      workflowId: 'ship',
      status: 'blocked',
      errorMessage: 'Agent Ops team policy blocked this run. Required workflow missing or stale: review.',
      metadata: {
        blocked_reason: 'Agent Ops team policy blocked this run. Required workflow missing or stale: review.',
        team_policy_gate: {
          allowed: false,
          missing_required: [{ workflowId: 'review' }],
        },
      },
    })
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => blockedRun),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
      orchestration: {
        startDag: vi.fn(async () => ({ dagId })),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
      runtimeSelector: {
        listCandidates: vi.fn(async () => [{ profileId: 'shared', engine: 'lucid' }]),
      },
      teamPolicyGate: {
        evaluateRunStart: vi.fn(async () => ({
          allowed: false,
          enforced: true,
          targetGates: ['deploy', 'ship'],
          required: [{
            workflowId: 'review',
            level: 'required',
            gateTargets: ['ship'],
            freshnessHours: 168,
            satisfied: false,
            lastRunId: null,
            lastRunAt: null,
            reason: 'No completed review run found for this project.',
          }],
          recommended: [],
          optional: [],
          missingRequired: [{
            workflowId: 'review',
            level: 'required',
            gateTargets: ['ship'],
            freshnessHours: 168,
            satisfied: false,
            lastRunId: null,
            lastRunAt: null,
            reason: 'No completed review run found for this project.',
          }],
          summary: 'Missing or stale required workflows: review.',
        })),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'ship',
      scope: { type: 'branch', ref: 'release/agent-ops', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(result.status).toBe('blocked')
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'blocked',
      errorMessage: expect.stringContaining('team policy blocked'),
      metadata: expect.objectContaining({
        blocked_reason: expect.stringContaining('team policy blocked'),
        team_policy_gate: expect.objectContaining({
          allowed: false,
          missing_required: expect.arrayContaining([
            expect.objectContaining({ workflowId: 'review' }),
          ]),
        }),
      }),
    }))
    expect(dependencies.runtimeSelector?.listCandidates).not.toHaveBeenCalled()
    expect(dependencies.orchestration?.startDag).not.toHaveBeenCalled()
  })

  it('passes specialist telemetry into the centralized Team Ops dispatch projection', async () => {
    const created = makeRun()
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => created),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
      runtimeSelector: {
        listCandidates: vi.fn(async () => [{ profileId: 'shared', engine: 'lucid' }]),
      },
      specialistTelemetry: {
        list: vi.fn(async () => [{
          slug: 'testing',
          name: 'Testing Reviewer',
          category: 'testing',
          critical: false,
          selectedCount: 6,
          runCount: 6,
          completedRunCount: 6,
          failedRunCount: 0,
          blockedRunCount: 0,
          findingCount: 0,
          openCount: 0,
          acceptedCount: 0,
          fixedCount: 0,
          dismissedCount: 0,
          needsInfoCount: 0,
          usefulFindingCount: 0,
          falsePositiveCount: 0,
          criticalFindingCount: 0,
          highSeverityFindingCount: 0,
          avgConfidence: null,
          usefulnessRate: null,
          avgLatencyMs: null,
          totalCostUsd: 0,
          totalTokens: 0,
          lastSeenAt: '2026-04-30T10:00:00.000Z',
          signal: 'needs_tuning',
          recommendation: 'Review prompts before expanding usage.',
        }]),
      },
    }

    await startAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(dependencies.specialistTelemetry?.list).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      workflow: expect.objectContaining({ id: 'review' }),
    }))
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        team_ops: expect.objectContaining({
          specialists: expect.not.arrayContaining([
            expect.objectContaining({ slug: 'testing' }),
          ]),
          adaptiveDispatch: expect.objectContaining({
            skippedSpecialists: expect.arrayContaining([
              expect.objectContaining({ slug: 'testing' }),
            ]),
          }),
        }),
      }),
    }))
  })

  it('blocks before dispatch when every runtime candidate is incompatible', async () => {
    const blockedRun = makeRun({
      status: 'blocked',
      errorMessage: 'No compatible runtime is currently available for this Agent Ops workflow. Missing capabilities: runtime:lucid.',
      metadata: {
        runtime_selection: { blocked: true, candidate_count: 1, missing_capabilities: ['runtime:lucid'] },
      },
    })
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => blockedRun),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
      orchestration: {
        startDag: vi.fn(async () => ({ dagId })),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
      runtimeSelector: {
        listCandidates: vi.fn(async () => [
          { profileId: 'c2a_autonomous', engine: 'lucid', label: 'Lucid C2A' },
        ]),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(result.status).toBe('blocked')
    expect(result.errorMessage).toContain('runtime:lucid')
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'blocked',
      errorMessage: expect.stringContaining('runtime:lucid'),
      metadata: expect.objectContaining({
        runtime_selection: expect.objectContaining({
          blocked: true,
          candidate_count: 1,
          missing_capabilities: ['runtime:lucid'],
        }),
      }),
    }))
    expect(dependencies.orchestration?.startDag).not.toHaveBeenCalled()
  })

  it('queues single-run workflows when no runtime adapter is available yet', async () => {
    const created = makeRun({ workflowId: 'investigate', status: 'queued' })
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => created),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'investigate',
      scope: { type: 'incident', ref: 'latency-spike', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(result.status).toBe('queued')
    expect(dependencies.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'queued',
    }))
    expect(dependencies.runStore.updateRunStatus).not.toHaveBeenCalled()
  })

  it('preserves single-run runtime output and root agent_run linkage', async () => {
    const created = makeRun({
      workflowId: 'investigate',
      status: 'running',
      metadata: {
        team_ops: { dispatchTier: 'simple' },
        launched_from: 'test',
      },
    })
    const completed = makeRun({
      workflowId: 'investigate',
      status: 'completed',
      output: { summary: 'Done' },
      agentRunIds: ['77777777-7777-4777-8777-777777777777'],
    })
    const dependencies: AgentOpsDependencies = {
      runStore: {
        createRun: vi.fn(async () => created),
        getRun: vi.fn(),
        updateRunStatus: vi.fn(async () => completed),
      },
      runtime: {
        startSingleRun: vi.fn(async () => ({
          agentRunId: '77777777-7777-4777-8777-777777777777',
          output: { summary: 'Done' },
        })),
      },
    }

    const result = await startAgentOpsRun({
      orgId,
      workflowId: 'investigate',
      scope: { type: 'incident', ref: 'latency-spike', metadata: {} },
      input: {},
      metadata: {},
    }, dependencies)

    expect(result.status).toBe('completed')
    expect(dependencies.runStore.updateRunStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      rootAgentRunId: '77777777-7777-4777-8777-777777777777',
      output: { summary: 'Done' },
      metadata: expect.objectContaining({
        agentRunId: '77777777-7777-4777-8777-777777777777',
        launched_from: 'test',
        team_ops: expect.objectContaining({ dispatchTier: 'simple' }),
      }),
    }))
  })

  it('cancels orchestration-backed runs before marking the product run cancelled', async () => {
    const run = makeRun({ orchestrationDagId: dagId, status: 'running' })
    const cancelled = makeRun({ orchestrationDagId: dagId, status: 'cancelled' })
    const dependencies: Pick<AgentOpsDependencies, 'runStore' | 'orchestration'> = {
      runStore: {
        createRun: vi.fn(),
        getRun: vi.fn(async () => run),
        updateRunStatus: vi.fn(async () => cancelled),
      },
      orchestration: {
        startDag: vi.fn(),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
    }

    const result = await cancelAgentOpsRun({ orgId, runId, reason: 'operator requested' }, dependencies)

    expect(result.status).toBe('cancelled')
    expect(dependencies.orchestration?.cancelDag).toHaveBeenCalledWith({
      orgId,
      dagId,
      reason: 'operator requested',
    })
  })

  it('retries DAG-backed runs through orchestration', async () => {
    const run = makeRun({ orchestrationDagId: dagId, status: 'failed' })
    const retryDagId = '44444444-4444-4444-8444-444444444444'
    const retried = makeRun({ orchestrationDagId: retryDagId, status: 'running' })
    const dependencies: Pick<AgentOpsDependencies, 'runStore' | 'orchestration'> = {
      runStore: {
        createRun: vi.fn(),
        getRun: vi.fn(async () => run),
        updateRunStatus: vi.fn(async () => retried),
      },
      orchestration: {
        startDag: vi.fn(),
        cancelDag: vi.fn(),
        retryDag: vi.fn(async () => ({ dagId: retryDagId })),
      },
    }

    const result = await retryAgentOpsRun({ orgId, runId, fromNodeKey: 'tests' }, dependencies)

    expect(result.orchestrationDagId).toBe(retryDagId)
    expect(dependencies.orchestration?.retryDag).toHaveBeenCalledWith({
      orgId,
      dagId,
      fromNodeKey: 'tests',
    })
  })

  it('refuses to retry runs that are not failed', async () => {
    const run = makeRun({ orchestrationDagId: dagId, status: 'running' })
    const dependencies: Pick<AgentOpsDependencies, 'runStore' | 'orchestration'> = {
      runStore: {
        createRun: vi.fn(),
        getRun: vi.fn(async () => run),
        updateRunStatus: vi.fn(),
      },
      orchestration: {
        startDag: vi.fn(),
        cancelDag: vi.fn(),
        retryDag: vi.fn(),
      },
    }

    await expect(retryAgentOpsRun({ orgId, runId }, dependencies)).rejects.toThrow(
      'Agent Ops run is not retryable from status running',
    )
    expect(dependencies.orchestration?.retryDag).not.toHaveBeenCalled()
    expect(dependencies.runStore.updateRunStatus).not.toHaveBeenCalled()
  })

  it('delegates artifacts and findings to the evidence port', async () => {
    const dependencies: Required<Pick<AgentOpsDependencies, 'evidence'>> = {
      evidence: {
        appendArtifact: vi.fn(async (input) => ({
          id: '55555555-5555-4555-8555-555555555555',
          orgId: input.orgId,
          runId: input.runId,
          type: input.type,
          title: input.title,
          summary: input.summary,
          uri: input.uri,
          content: input.content,
          checksum: input.checksum,
          createdAt: '2026-04-28T00:00:00.000Z',
        })),
        appendFinding: vi.fn(async (input) => ({
          id: '66666666-6666-4666-8666-666666666666',
          orgId: input.orgId,
          runId: input.runId,
          severity: input.severity,
          status: 'open',
          title: input.title,
          body: input.body,
          filePath: input.filePath,
          startLine: input.startLine,
          endLine: input.endLine,
          confidence: input.confidence,
          evidenceArtifactId: input.evidenceArtifactId,
          fingerprint: input.fingerprint,
          metadata: input.metadata,
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        })),
      },
    }

    const artifact = await appendAgentOpsArtifact({
      orgId,
      runId,
      type: 'log_excerpt',
      title: 'Worker logs',
      content: { lines: ['ok'] },
    }, dependencies)
    const fingerprint = buildFindingFingerprint({
      runId,
      severity: 'high',
      title: 'Missing auth check',
      filePath: 'src/api.ts',
      startLine: 42,
      body: 'This route trusts caller input.',
    })
    const finding = await appendAgentOpsFinding({
      orgId,
      runId,
      severity: 'high',
      title: 'Missing auth check',
      body: 'This route trusts caller input.',
      filePath: 'src/api.ts',
      startLine: 42,
      confidence: 0.92,
      fingerprint,
    }, dependencies)

    expect(artifact.type).toBe('log_excerpt')
    expect(finding.fingerprint).toBe(fingerprint)
    expect(dependencies.evidence.appendArtifact).toHaveBeenCalledOnce()
    expect(dependencies.evidence.appendFinding).toHaveBeenCalledOnce()
  })
})
