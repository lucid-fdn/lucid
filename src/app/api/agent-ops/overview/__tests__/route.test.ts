import { performance } from 'node:perf_hooks'

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  isUserOrgMember: vi.fn(),
  checkRateLimit: vi.fn(),
  listProjectLearnings: vi.fn(),
  listDecisionPreferences: vi.fn(),
  listAgentOpsEvalRuns: vi.fn(),
  listEvalReceipts: vi.fn(),
  listAgentOpsPerformanceAlertTimelineEvents: vi.fn(),
  listAgentOpsBrowserHostPlaybooks: vi.fn(),
  listAgentOpsBrowserSecurityEvents: vi.fn(),
  listAgentOpsBrowserSessionEvents: vi.fn(),
  listAgentOpsBrowserSessionShares: vi.fn(),
  listAgentOpsBrowserSessionSharedActions: vi.fn(),
  listAgentOpsOperatorProfiles: vi.fn(),
  listAgentOpsDesignFeedback: vi.fn(),
  listAgentOpsDecisionEvents: vi.fn(),
  listAgentOpsBrowserProcedures: vi.fn(),
  listAgentOpsSecurityAttempts: vi.fn(),
  listAgentOpsSpecialistTelemetry: vi.fn(),
  listAgentOpsContextSnapshots: vi.fn(),
  getAgentOpsProjectPolicy: vi.fn(),
  getAgentOpsPerformanceSummary: vi.fn(),
  recordAgentOpsProjectTimelineEvent: vi.fn(),
  notifyAgentOpsPerformanceAlert: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
  },
}))

vi.mock('@/lib/db', () => ({
  getAgentOpsPerformanceSummary: mocks.getAgentOpsPerformanceSummary,
  getAgentOpsProjectPolicy: mocks.getAgentOpsProjectPolicy,
  isUserOrgMember: mocks.isUserOrgMember,
  listAgentOpsContextSnapshots: mocks.listAgentOpsContextSnapshots,
  listAgentOpsEvalRuns: mocks.listAgentOpsEvalRuns,
  listEvalReceipts: mocks.listEvalReceipts,
  listAgentOpsPerformanceAlertTimelineEvents: mocks.listAgentOpsPerformanceAlertTimelineEvents,
  listAgentOpsBrowserHostPlaybooks: mocks.listAgentOpsBrowserHostPlaybooks,
  listAgentOpsBrowserSecurityEvents: mocks.listAgentOpsBrowserSecurityEvents,
  listAgentOpsBrowserSessionEvents: mocks.listAgentOpsBrowserSessionEvents,
  listAgentOpsBrowserSessionShares: mocks.listAgentOpsBrowserSessionShares,
  listAgentOpsBrowserSessionSharedActions: mocks.listAgentOpsBrowserSessionSharedActions,
  listAgentOpsOperatorProfiles: mocks.listAgentOpsOperatorProfiles,
  listAgentOpsDesignFeedback: mocks.listAgentOpsDesignFeedback,
  listAgentOpsDecisionEvents: mocks.listAgentOpsDecisionEvents,
  listAgentOpsBrowserProcedures: mocks.listAgentOpsBrowserProcedures,
  listAgentOpsSecurityAttempts: mocks.listAgentOpsSecurityAttempts,
  listAgentOpsSpecialistTelemetry: mocks.listAgentOpsSpecialistTelemetry,
  listDecisionPreferences: mocks.listDecisionPreferences,
  listProjectLearnings: mocks.listProjectLearnings,
  recordAgentOpsProjectTimelineEvent: mocks.recordAgentOpsProjectTimelineEvent,
}))

vi.mock('@/lib/agent-ops/alert-notifications', () => ({
  notifyAgentOpsPerformanceAlert: mocks.notifyAgentOpsPerformanceAlert,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const assistantId = '44444444-4444-4444-8444-444444444444'
const userId = '55555555-5555-4555-8555-555555555555'

describe('/api/agent-ops/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.listProjectLearnings.mockResolvedValue([{ id: 'learning-1', title: 'Prefer shared runs', type: 'architecture', trustLevel: 'observed', updatedAt: '2026-04-29T00:00:00.000Z' }])
    mocks.listDecisionPreferences.mockResolvedValue([{ id: 'pref-1', key: 'release-gates', riskLevel: 'medium', status: 'active' }])
    mocks.listAgentOpsEvalRuns.mockResolvedValue([{ id: 'eval-1', workflowId: 'review', targetKind: 'workflow', targetRef: 'review', score: 92, passRate: 100, createdAt: '2026-04-29T00:00:00.000Z' }])
    mocks.listEvalReceipts.mockResolvedValue([{
      id: 'receipt-1',
      orgId,
      projectId,
      runId: 'run-1',
      sourceType: 'agent_ops_run',
      sourceId: 'run-1',
      task: 'Judge review output',
      outputHash: '0123456789abcdef',
      dimensions: ['correctness', 'evidence'],
      judges: [
        { providerClass: 'lucid_quality', model: 'heuristic-quality-v1', ok: true, scores: { correctness: 8, evidence: 8 }, durationMs: 2 },
        { providerClass: 'lucid_safety', model: 'heuristic-safety-v1', ok: true, scores: { correctness: 7.5, evidence: 7 }, durationMs: 2 },
      ],
      verdict: 'pass',
      aggregate: { overallAverage: 7.63 },
      metadata: {},
      createdAt: '2026-05-07T00:00:00.000Z',
    }])
    mocks.listAgentOpsPerformanceAlertTimelineEvents.mockResolvedValue([{
      id: 'alert-event-1',
      title: 'Agent Ops performance budget breached',
      body: 'p95 latency is over budget.',
      evidence: { status: 'breach' },
      metadata: {
        fingerprint: 'agent-ops:performance-alert:v1:test',
        status: 'breach',
        signal_ids: ['failure_rate'],
      },
      createdAt: '2026-04-29T00:00:00.000Z',
    }])
    mocks.listAgentOpsBrowserProcedures.mockResolvedValue([{
      id: 'procedure-1',
      projectId,
      hostPattern: 'www.example.com',
      name: 'Check homepage',
      slug: 'check-homepage',
      description: 'Validate homepage with Browser Operator.',
      intentTriggers: ['check homepage'],
      procedureType: 'qa',
      scope: 'project',
      trustState: 'active',
      sourceRunId: null,
      updatedAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsBrowserHostPlaybooks.mockResolvedValue([{
      id: 'playbook-1',
      projectId,
      hostPattern: 'www.example.com',
      title: 'Homepage host notes',
      bodyMd: 'Use the public homepage smoke path.',
      scope: 'project',
      trustState: 'active',
      successfulUses: 3,
      securityFlagsCount: 0,
      lastUsedAt: null,
      sourceRunId: null,
      updatedAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsBrowserSecurityEvents.mockResolvedValue([{
      id: 'browser-event-1',
      orgId,
      projectId,
      opsRunId: 'run-1',
      browserSessionId: 'session-1',
      eventType: 'prompt_injection_pattern',
      severity: 'warn',
      layer: 'browser_content',
      host: 'www.example.com',
      details: { pattern: 'ignore previous instructions' },
      createdAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsBrowserSessionEvents.mockResolvedValue([{
      id: 'session-event-1',
      runId: 'run-1',
      sessionKey: 'session-key-1',
      eventType: 'handoff_required',
      severity: 'warn',
      handoffState: 'auth_required',
      currentUrl: 'https://www.example.com/login',
      message: 'Login required.',
      metadata: {},
      createdAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsBrowserSessionShares.mockResolvedValue([{
      id: 'share-1',
      runId: 'run-1',
      sessionKey: 'session-key-1',
      tokenPrefix: 'lucid_browser_share_abc',
      scope: 'read-only',
      status: 'active',
      grantedToRuntimeId: 'shared',
      grantedToAgentLabel: 'Browser QA Specialist',
      tabIdentity: 'tab_123',
      rateLimitPerMinute: 30,
      expiresAt: '2026-05-02T00:15:00.000Z',
      metadata: {},
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsBrowserSessionSharedActions.mockResolvedValue([{
      id: 'share-action-1',
      runId: 'run-1',
      sessionKey: 'session-key-1',
      scope: 'read-only',
      actionType: 'session_observed',
      status: 'allowed',
      actorRuntimeId: 'shared',
      actorAgentLabel: 'Browser QA Specialist',
      tabIdentity: 'tab_123',
      currentUrl: 'https://www.example.com/login',
      message: 'Browser session observed.',
      metadata: {},
      createdAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsOperatorProfiles.mockResolvedValue([{
      id: 'profile-1',
      orgId,
      projectId,
      profileType: 'design_taste',
      declared: { visual_direction: 'editorial, confident, clean' },
      inferred: { avoids: ['generic gradients'] },
      confidence: { visual_direction: 0.8 },
      decayPolicy: { half_life_days: 90 },
      updatedAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsDesignFeedback.mockResolvedValue([{
      id: 'feedback-1',
      orgId,
      projectId,
      runId: 'run-1',
      variantKey: 'editorial-a',
      feedbackType: 'approval',
      status: 'approved',
      feedback: 'Use this direction for the landing hero.',
      source: 'operator',
      metadata: {},
      createdAt: '2026-05-02T00:00:00.000Z',
    }])
    mocks.listAgentOpsDecisionEvents.mockResolvedValue([
      {
        id: 'decision-1',
        orgId,
        projectId,
        runId: 'run-1',
        phase: 'execute',
        questionId: 'browser-mutation',
        doorType: 'one_way',
        decisionMode: 'asked',
        question: 'Should Browser Operator perform a mutating action?',
        options: [],
        selectedOption: { id: 'ask', label: 'Ask first' },
        riskReason: 'Mutating browser actions can change external state and must be visible.',
        reversible: false,
        flippedFromEventId: null,
        metadata: {},
        createdByUserId: userId,
        createdAt: '2026-05-03T00:00:00.000Z',
      },
      {
        id: 'decision-2',
        orgId,
        projectId,
        runId: 'run-1',
        phase: 'review',
        questionId: 'docs-copy-style',
        doorType: 'two_way',
        decisionMode: 'silent_decision',
        question: 'Which copy style should Agent Ops use?',
        options: [],
        selectedOption: { id: 'plain', label: 'Plain' },
        riskReason: 'Copy style can be changed later.',
        reversible: true,
        flippedFromEventId: null,
        metadata: {},
        createdByUserId: null,
        createdAt: '2026-05-03T00:01:00.000Z',
      },
    ])
    mocks.listAgentOpsSecurityAttempts.mockResolvedValue([{ id: 'attempt-1', severity: 'high', status: 'open', title: 'Canary leak', createdAt: '2026-04-29T00:00:00.000Z' }])
    mocks.listAgentOpsSpecialistTelemetry.mockResolvedValue([{
      slug: 'security',
      name: 'Security Reviewer',
      category: 'security',
      critical: true,
      selectedCount: 3,
      runCount: 3,
      completedRunCount: 2,
      failedRunCount: 0,
      blockedRunCount: 1,
      findingCount: 2,
      openCount: 0,
      acceptedCount: 1,
      fixedCount: 1,
      dismissedCount: 0,
      needsInfoCount: 0,
      usefulFindingCount: 2,
      falsePositiveCount: 0,
      criticalFindingCount: 1,
      highSeverityFindingCount: 0,
      avgConfidence: 0.91,
      usefulnessRate: 100,
      avgLatencyMs: 2_100,
      totalCostUsd: 0.012,
      totalTokens: 4_000,
      lastSeenAt: '2026-04-29T00:00:00.000Z',
      signal: 'high_value',
      recommendation: 'Keep this specialist in the dispatch plan.',
    }])
    mocks.listAgentOpsContextSnapshots.mockResolvedValue([{ id: 'snapshot-1', kind: 'handoff', title: 'Release handoff', createdAt: '2026-04-29T00:00:00.000Z' }])
    mocks.getAgentOpsProjectPolicy.mockResolvedValue({ safetyMode: 'observe', metadata: {} })
    mocks.recordAgentOpsProjectTimelineEvent.mockResolvedValue(true)
    mocks.notifyAgentOpsPerformanceAlert.mockResolvedValue(undefined)
    mocks.getAgentOpsPerformanceSummary.mockResolvedValue({
      runCount: 12,
      completedRunCount: 10,
      failedRunCount: 1,
      measuredRunCount: 11,
      avgLatencyMs: 2_500,
      p95LatencyMs: 4_000,
      totalCostUsd: 0.045,
      avgCostUsd: 0.00375,
      totalTokens: 12_000,
      avgTokens: 1_000,
      windowDays: 14,
    })
  })

  it('returns intelligence and performance summaries for an org member', async () => {
    const response = await GET(new NextRequest(
      `http://localhost:3000/api/agent-ops/overview?org_id=${orgId}&project_id=${projectId}&assistant_id=${assistantId}`,
    ))
    const body = await response.json()
    await new Promise((resolve) => setImmediate(resolve))

    expect(response.status).toBe(200)
    expect(mocks.getAgentOpsPerformanceSummary).toHaveBeenCalledWith({
      orgId,
      projectId,
      assistantId,
      windowDays: 14,
    })
    expect(mocks.listAgentOpsPerformanceAlertTimelineEvents).toHaveBeenCalledWith({
      orgId,
      projectId,
      assistantId,
      limit: 10,
    })
    expect(mocks.listAgentOpsSpecialistTelemetry).toHaveBeenCalledWith({
      orgId,
      projectId,
      assistantId,
      limit: 12,
    })
    expect(mocks.listEvalReceipts).toHaveBeenCalledWith({
      orgId,
      projectId,
      limit: 8,
    })
    expect(body.performance).toMatchObject({
      runCount: 12,
      avgLatencyMs: 2_500,
      totalCostUsd: 0.045,
      totalTokens: 12_000,
    })
    expect(body.performanceHealth).toMatchObject({
      status: 'watch',
      summary: '1 Agent Ops performance budget near limit.',
    })
    expect(body.performanceAlert).toMatchObject({
      status: 'watch',
      title: 'Agent Ops performance budget near limit',
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'investigate-failures',
          workflowId: 'investigate',
        }),
      ]),
    })
    expect(body.performanceAlertDecision).toMatchObject({
      state: 'active',
      shouldRecord: true,
      shouldNotify: true,
    })
    expect(body.performanceAlertHistory).toEqual([expect.objectContaining({
      status: 'breach',
      fingerprint: 'agent-ops:performance-alert:v1:test',
      lifecycleState: 'recorded',
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'investigate-failures',
          workflowId: 'investigate',
        }),
      ]),
    })])
    expect(body.specialistTelemetry).toEqual([expect.objectContaining({
      slug: 'security',
      usefulFindingCount: 2,
      signal: 'high_value',
    })])
    expect(body.teamSetupDoctor).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'runtime-doctor', status: 'ready' }),
      expect.objectContaining({ id: 'capability-doctor', status: 'ready' }),
      expect.objectContaining({ id: 'workflow-pack', status: 'ready' }),
      expect.objectContaining({ id: 'approval-policy', status: 'missing' }),
      expect.objectContaining({ id: 'channel-surface', status: 'optional' }),
    ]))
    expect(mocks.recordAgentOpsProjectTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      eventType: 'agent_ops_performance_alert',
      title: 'Agent Ops performance budget near limit',
      createdBy: userId,
      metadata: expect.objectContaining({
        alert_kind: 'agent_ops_performance_budget',
        status: 'watch',
        assistant_id: assistantId,
      }),
    }))
    expect(mocks.notifyAgentOpsPerformanceAlert).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      assistantId,
      alert: expect.objectContaining({
        status: 'watch',
        title: 'Agent Ops performance budget near limit',
      }),
    }))
    expect(body.summary).toMatchObject({
      learningCount: 1,
      decisionPreferenceCount: 1,
      latestEvalScore: 92,
      evalReceiptCount: 1,
      latestEvalReceiptVerdict: 'pass',
      openSecurityAttemptCount: 1,
      contextSnapshotCount: 1,
      safetyMode: 'observe',
      runCount: 12,
      avgLatencyMs: 2_500,
      totalCostUsd: 0.045,
      totalTokens: 12_000,
      performanceHealth: 'watch',
      specialistCount: 1,
      specialistUsefulFindingCount: 2,
      browserProcedureCount: 1,
      activeBrowserProcedureCount: 1,
      browserHostPlaybookCount: 1,
      activeBrowserHostPlaybookCount: 1,
      browserSecurityEventCount: 1,
      blockingBrowserSecurityEventCount: 0,
      browserSessionEventCount: 1,
      browserHandoffRequiredCount: 1,
      browserSessionShareCount: 1,
      activeBrowserSessionShareCount: 1,
      browserSessionSharedActionCount: 1,
      browserOperatorHealth: 'needs_review',
      browserOperatorActiveSessionCount: 0,
      browserOperatorResumableSessionCount: 0,
      operatorProfileCount: 1,
      designTasteProfileCount: 1,
      designFeedbackCount: 1,
      approvedDesignFeedbackCount: 1,
      teamSetupReadyCount: 5,
      teamSetupRequiredMissingCount: 1,
      qualityGateCount: 12,
      requiredQualityGateCount: 12,
      liveQualityGateCount: 0,
      destructiveQualityGateCount: 0,
      completionAreaCount: 13,
      verifiedCompletionAreaCount: 13,
      runtimeAgnosticCompletionAreaCount: 13,
      completionMatrixGapCount: 0,
      decisionEventCount: 2,
      askedDecisionCount: 1,
      silentDecisionCount: 1,
      flippedDecisionCount: 0,
      oneWayDecisionCount: 1,
    })
    expect(body.qualityGateReport).toMatchObject({
      schemaVersion: 1,
      target: 'local',
      summary: {
        total: 12,
        required: 12,
        live: 0,
        destructive: 0,
      },
    })
    expect(body.qualityGateReport.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'diff-hygiene', phase: 'source_hygiene' }),
      expect.objectContaining({ id: 'completion-matrix-smoke', phase: 'generated_contracts' }),
      expect.objectContaining({ id: 'channel-native-smoke', phase: 'channel_readiness' }),
      expect.objectContaining({ id: 'web-app-smoke', phase: 'channel_readiness' }),
      expect.objectContaining({ id: 'agent-ops-stress', phase: 'stress_latency' }),
    ]))
    expect(body.completionMatrix).toMatchObject({
      summary: {
        total: 13,
        verified: 13,
        tenantScoped: 13,
        runtimeAgnostic: 13,
        engineAgnostic: 13,
        channelAgnostic: 13,
        missingEvidence: [],
      },
    })
    expect(body.completionMatrix.areas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'browser-procedure-registry', status: 'verified' }),
      expect.objectContaining({ id: 'mission-control-quality-gates', layer: 'mission_control' }),
    ]))
    expect(body.browserOperator).toMatchObject({
      schemaVersion: 1,
      health: 'needs_review',
      summary: {
        procedureCount: 1,
        activeProcedureCount: 1,
        playbookCount: 1,
        activePlaybookCount: 1,
        sessionCount: 1,
        handoffSessionCount: 1,
        activeShareCount: 1,
      },
      sessions: [
        expect.objectContaining({
          sessionKey: 'session-key-1',
          status: 'handoff_required',
          latestMessage: 'Login required.',
          activeShareCount: 1,
        }),
      ],
    })
  })

  it('does not record a timeline alert when performance is healthy', async () => {
    mocks.getAgentOpsPerformanceSummary.mockResolvedValue({
      runCount: 12,
      completedRunCount: 12,
      failedRunCount: 0,
      measuredRunCount: 12,
      avgLatencyMs: 1_000,
      p95LatencyMs: 1_500,
      totalCostUsd: 0.01,
      avgCostUsd: 0.001,
      totalTokens: 2_000,
      avgTokens: 167,
      windowDays: 14,
    })

    const response = await GET(new NextRequest(
      `http://localhost:3000/api/agent-ops/overview?org_id=${orgId}&project_id=${projectId}`,
    ))
    const body = await response.json()
    await new Promise((resolve) => setImmediate(resolve))

    expect(response.status).toBe(200)
    expect(body.performanceHealth).toMatchObject({ status: 'healthy' })
    expect(body.performanceAlert).toBeNull()
    expect(mocks.recordAgentOpsProjectTimelineEvent).not.toHaveBeenCalled()
    expect(mocks.notifyAgentOpsPerformanceAlert).not.toHaveBeenCalled()
  })

  it('suppresses timeline alerts and fanout when alert controls are muted', async () => {
    mocks.getAgentOpsProjectPolicy.mockResolvedValue({
      safetyMode: 'observe',
      metadata: {
        performance_alerts: {
          muted: true,
        },
      },
    })

    const response = await GET(new NextRequest(
      `http://localhost:3000/api/agent-ops/overview?org_id=${orgId}&project_id=${projectId}`,
    ))
    const body = await response.json()
    await new Promise((resolve) => setImmediate(resolve))

    expect(response.status).toBe(200)
    expect(body.performanceAlertDecision).toMatchObject({
      state: 'muted',
      shouldRecord: false,
      shouldNotify: false,
    })
    expect(mocks.recordAgentOpsProjectTimelineEvent).not.toHaveBeenCalled()
    expect(mocks.notifyAgentOpsPerformanceAlert).not.toHaveBeenCalled()
  })

  it('does not fan out notifications when the timeline alert already exists', async () => {
    mocks.recordAgentOpsProjectTimelineEvent.mockResolvedValue(false)

    const response = await GET(new NextRequest(
      `http://localhost:3000/api/agent-ops/overview?org_id=${orgId}&project_id=${projectId}`,
    ))
    await response.json()
    await new Promise((resolve) => setImmediate(resolve))

    expect(response.status).toBe(200)
    expect(mocks.recordAgentOpsProjectTimelineEvent).toHaveBeenCalled()
    expect(mocks.notifyAgentOpsPerformanceAlert).not.toHaveBeenCalled()
  })

  it('marks timeline alert history as resolved from alert policy metadata', async () => {
    mocks.getAgentOpsProjectPolicy.mockResolvedValue({
      safetyMode: 'observe',
      metadata: {
        performance_alerts: {
          resolved_fingerprints: {
            'agent-ops:performance-alert:v1:test': {
              resolved_at: '2026-04-30T10:15:00.000Z',
              resolved_by: userId,
              resolving_run_id: null,
              note: 'Recovered after triage.',
            },
          },
        },
      },
    })

    const response = await GET(new NextRequest(
      `http://localhost:3000/api/agent-ops/overview?org_id=${orgId}&project_id=${projectId}`,
    ))
    const body = await response.json()
    await new Promise((resolve) => setImmediate(resolve))

    expect(response.status).toBe(200)
    expect(body.performanceAlertHistory).toEqual([expect.objectContaining({
      fingerprint: 'agent-ops:performance-alert:v1:test',
      lifecycleState: 'resolved',
      resolvedAt: '2026-04-30T10:15:00.000Z',
      resolutionNote: 'Recovered after triage.',
      actions: [],
    })])
  })

  it('keeps repeated overview alert refreshes bounded and dedupes notification fanout', async () => {
    mocks.recordAgentOpsProjectTimelineEvent
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false)

    const latencies: number[] = []

    for (let index = 0; index < 25; index += 1) {
      const startedAt = performance.now()
      const response = await GET(new NextRequest(
        `http://localhost:3000/api/agent-ops/overview?org_id=${orgId}&project_id=${projectId}&assistant_id=${assistantId}`,
      ))
      const body = await response.json()
      await new Promise((resolve) => setImmediate(resolve))

      expect(response.status).toBe(200)
      expect(body.performanceAlertDecision).toMatchObject({
        state: 'active',
        shouldRecord: true,
        shouldNotify: true,
      })
      latencies.push(performance.now() - startedAt)
    }

    const sorted = [...latencies].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
    const total = latencies.reduce((sum, value) => sum + value, 0)

    expect(mocks.recordAgentOpsProjectTimelineEvent).toHaveBeenCalledTimes(25)
    expect(mocks.notifyAgentOpsPerformanceAlert).toHaveBeenCalledTimes(1)
    expect(p95).toBeLessThan(100)
    expect(total).toBeLessThan(3_000)
  })
})
