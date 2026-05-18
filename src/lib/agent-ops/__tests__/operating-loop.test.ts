import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsPerformanceAlert,
  buildAgentOpsPerformanceAlertActions,
  buildAgentOpsPerformanceAlertHistory,
  buildContextSnapshotFingerprint,
  buildReleaseChecklist,
  buildResumeSummary,
  buildTeamModeBootstrapPlan,
  diffContextSnapshots,
  evaluateAgentOpsPerformanceAlertDecision,
  evaluateAgentOpsPerformanceHealth,
  listPhase8WorkflowIds,
  resolveAgentOpsPerformanceAlertControls,
  resolveAgentOpsPerformanceBudget,
  resolveSafetyPolicy,
  resolveTeamSetupDoctorInstalledRequirementIds,
} from '../operating-loop'

describe('Agent Ops operating loop', () => {
  it('covers the full design/docs/release loop with clear workflow ids', () => {
    expect(listPhase8WorkflowIds()).toEqual([
      'design-consultation',
      'design-variants',
      'design-review',
      'design-to-code',
      'devex-review',
      'devex-audit',
      'document-release',
      'release-check',
      'version-gate',
      'pr-title-sync',
      'product-quality-lint',
      'ship',
      'canary',
      'retro',
    ])
    expect(buildReleaseChecklist('design-variants').map((item) => item.id)).toContain('design-variants')
    expect(buildReleaseChecklist('design-review').map((item) => item.id)).toContain('visual-diff')
    expect(buildReleaseChecklist('document-release').map((item) => item.id)).toContain('publication-approval')
    expect(buildReleaseChecklist('release-check').map((item) => item.id)).toEqual(expect.arrayContaining([
      'stale-docs',
      'missing-regression-tests',
      'release-note-drift',
      'version-drift',
    ]))
    expect(buildReleaseChecklist('product-quality-lint').map((item) => item.id)).toContain('ai-slop-patterns')
    expect(buildReleaseChecklist('ship').map((item) => item.id)).toEqual([
      'version',
      'changelog',
      'pull-request',
      'deploy',
      'canary',
    ])
  })

  it('builds team bootstrap status without coupling to templates', () => {
    const plan = buildTeamModeBootstrapPlan({ installedRequirementIds: ['runtime-doctor', 'capability-doctor', 'workflow-pack'] })

    expect(plan.filter((item) => item.status === 'ready').map((item) => item.id)).toEqual([
      'runtime-doctor',
      'capability-doctor',
      'workflow-pack',
    ])
    expect(plan.find((item) => item.id === 'approval-policy')?.status).toBe('missing')
    expect(plan.find((item) => item.id === 'eval-pack')?.status).toBe('optional')
  })

  it('resolves team setup doctor readiness from metadata and runtime-agnostic signals', () => {
    const installedRequirementIds = resolveTeamSetupDoctorInstalledRequirementIds({
      team_setup_doctor: {
        installed_requirement_ids: ['runtime-doctor'],
        channel_ready_count: 1,
      },
      team_policy: {
        workflows: [
          { workflow_id: 'review', level: 'required', enabled: true },
        ],
      },
    }, {
      specialistCount: 2,
      evalRunCount: 1,
      learningCount: 1,
    })

    expect(installedRequirementIds).toEqual([
      'runtime-doctor',
      'capability-doctor',
      'workflow-pack',
      'approval-policy',
      'project-learnings',
      'eval-pack',
      'channel-surface',
    ])
    expect(buildTeamModeBootstrapPlan({ installedRequirementIds }).every((item) => item.status === 'ready')).toBe(true)
  })

  it('keeps safety modes explicit and conservative', () => {
    expect(resolveSafetyPolicy('freeze')).toMatchObject({
      writeActionsAllowed: false,
      autoRetryAllowed: false,
    })
    expect(resolveSafetyPolicy('guard')).toMatchObject({
      requiresApprovalForWrites: true,
      autoRetryAllowed: false,
    })
    expect(resolveSafetyPolicy('normal')).toMatchObject({
      writeActionsAllowed: true,
      autoRetryAllowed: true,
    })
  })

  it('diffs context snapshots for handoff and resume', () => {
    const diff = diffContextSnapshots({
      previous: { branch: 'main', tests: ['unit'], owner: 'lucid' },
      current: { branch: 'feature/agent-ops', tests: ['unit'], release: 'canary' },
    })

    expect(diff).toEqual({
      added: ['release'],
      removed: ['owner'],
      changed: ['branch'],
      unchanged: ['tests'],
    })
    expect(buildResumeSummary({ previousTitle: 'QA handoff', diff })).toContain('Changed: branch.')
  })

  it('fingerprints snapshots deterministically', () => {
    const input = {
      orgId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      kind: 'handoff' as const,
      title: 'Release handoff',
      state: { b: 2, a: 1 },
    }

    expect(buildContextSnapshotFingerprint(input)).toBe(buildContextSnapshotFingerprint({
      ...input,
      state: { a: 1, b: 2 },
    }))
  })

  it('evaluates performance budgets without runtime-specific assumptions', () => {
    const budget = resolveAgentOpsPerformanceBudget({
      performance_budget: {
        p95_latency_ms: 5_000,
        avg_latency_ms: 2_000,
        failure_rate_pct: 5,
        avg_cost_usd: 0.1,
        total_cost_usd: 10,
      },
    })

    const health = evaluateAgentOpsPerformanceHealth({
      runCount: 20,
      completedRunCount: 18,
      failedRunCount: 2,
      measuredRunCount: 20,
      avgLatencyMs: 1_900,
      p95LatencyMs: 6_000,
      avgCostUsd: 0.05,
      totalCostUsd: 1,
    }, budget)

    expect(health.status).toBe('breach')
    expect(health.signals.find((signal) => signal.id === 'p95_latency')).toMatchObject({
      status: 'breach',
      unit: 'ms',
    })
    expect(health.signals.find((signal) => signal.id === 'failure_rate')).toMatchObject({
      actual: 10,
      status: 'breach',
    })
  })

  it('marks performance health as insufficient until enough runs are measured', () => {
    const health = evaluateAgentOpsPerformanceHealth({
      runCount: 1,
      completedRunCount: 1,
      failedRunCount: 0,
      measuredRunCount: 1,
      avgLatencyMs: 200,
      p95LatencyMs: 200,
      avgCostUsd: 0.01,
      totalCostUsd: 0.01,
    }, resolveAgentOpsPerformanceBudget())

    expect(health.status).toBe('insufficient_data')
    expect(health.summary).toContain('Not enough measured')
  })

  it('projects performance budget alerts without runtime-specific state', () => {
    const health = evaluateAgentOpsPerformanceHealth({
      runCount: 20,
      completedRunCount: 18,
      failedRunCount: 2,
      measuredRunCount: 20,
      avgLatencyMs: 1_900,
      p95LatencyMs: 6_000,
      avgCostUsd: 0.05,
      totalCostUsd: 1,
    }, resolveAgentOpsPerformanceBudget({
      performance_budget: {
        p95_latency_ms: 5_000,
        avg_latency_ms: 2_000,
        failure_rate_pct: 5,
      },
    }))

    const alert = buildAgentOpsPerformanceAlert({
      orgId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      assistantId: '33333333-3333-4333-8333-333333333333',
      health,
      windowDays: 14,
    })
    const repeated = buildAgentOpsPerformanceAlert({
      orgId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      assistantId: '33333333-3333-4333-8333-333333333333',
      health: {
        ...health,
        signals: health.signals.map((signal) => signal.id === 'p95_latency'
          ? { ...signal, actual: 6_500 }
          : signal),
      },
      windowDays: 14,
    })

    expect(alert).toMatchObject({
      status: 'breach',
      title: 'Agent Ops performance budget breached',
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'investigate-latency',
          workflowId: 'investigate',
          priority: 'urgent',
        }),
      ]),
      metadata: {
        alert_kind: 'agent_ops_performance_budget',
        status: 'breach',
        signal_ids: ['p95_latency', 'failure_rate'],
      },
    })
    expect(alert?.fingerprint).toBe(repeated?.fingerprint)
  })

  it('does not project alerts while performance is healthy or still warming up', () => {
    const healthy = evaluateAgentOpsPerformanceHealth({
      runCount: 20,
      completedRunCount: 20,
      failedRunCount: 0,
      measuredRunCount: 20,
      avgLatencyMs: 1_000,
      p95LatencyMs: 1_500,
      avgCostUsd: 0.01,
      totalCostUsd: 1,
    }, resolveAgentOpsPerformanceBudget())

    expect(buildAgentOpsPerformanceAlert({
      orgId: '11111111-1111-4111-8111-111111111111',
      health: healthy,
      windowDays: 14,
    })).toBeNull()
  })

  it('applies performance alert controls before recording or notifying', () => {
    const health = evaluateAgentOpsPerformanceHealth({
      runCount: 20,
      completedRunCount: 20,
      failedRunCount: 0,
      measuredRunCount: 20,
      avgLatencyMs: 1_900,
      p95LatencyMs: 4_100,
      avgCostUsd: 0.01,
      totalCostUsd: 1,
    }, resolveAgentOpsPerformanceBudget({
      performance_budget: {
        p95_latency_ms: 5_000,
        warning_ratio: 0.8,
      },
    }))
    const alert = buildAgentOpsPerformanceAlert({
      orgId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      health,
      windowDays: 14,
    })

    expect(evaluateAgentOpsPerformanceAlertDecision({
      alert,
      controls: resolveAgentOpsPerformanceAlertControls({
        performance_alerts: {
          min_status: 'breach',
        },
      }),
    })).toMatchObject({
      state: 'below_threshold',
      shouldRecord: false,
      shouldNotify: false,
    })

    expect(evaluateAgentOpsPerformanceAlertDecision({
      alert,
      controls: resolveAgentOpsPerformanceAlertControls({
        performance_alerts: {
          muted: true,
        },
      }),
    })).toMatchObject({
      state: 'muted',
      shouldRecord: false,
      shouldNotify: false,
    })
  })

  it('acknowledges a current alert without suppressing timeline state', () => {
    const health = evaluateAgentOpsPerformanceHealth({
      runCount: 20,
      completedRunCount: 18,
      failedRunCount: 2,
      measuredRunCount: 20,
      avgLatencyMs: 1_900,
      p95LatencyMs: 6_000,
      avgCostUsd: 0.05,
      totalCostUsd: 1,
    }, resolveAgentOpsPerformanceBudget({
      performance_budget: {
        p95_latency_ms: 5_000,
      },
    }))
    const alert = buildAgentOpsPerformanceAlert({
      orgId: '11111111-1111-4111-8111-111111111111',
      health,
      windowDays: 14,
    })

    const decision = evaluateAgentOpsPerformanceAlertDecision({
      alert,
      controls: resolveAgentOpsPerformanceAlertControls({
        performance_alerts: {
          acknowledged_fingerprints: {
            [alert!.fingerprint]: {
              acknowledged_at: '2026-04-30T10:00:00.000Z',
              acknowledged_by: null,
            },
          },
        },
      }),
    })

    expect(decision).toMatchObject({
      state: 'acknowledged',
      shouldRecord: true,
      shouldNotify: false,
    })
  })

  it('resolves a current alert and suppresses active triage until the fingerprint changes', () => {
    const health = evaluateAgentOpsPerformanceHealth({
      runCount: 20,
      completedRunCount: 18,
      failedRunCount: 2,
      measuredRunCount: 20,
      avgLatencyMs: 1_900,
      p95LatencyMs: 6_000,
      avgCostUsd: 0.05,
      totalCostUsd: 1,
    }, resolveAgentOpsPerformanceBudget({
      performance_budget: {
        p95_latency_ms: 5_000,
      },
    }))
    const alert = buildAgentOpsPerformanceAlert({
      orgId: '11111111-1111-4111-8111-111111111111',
      health,
      windowDays: 14,
    })

    const decision = evaluateAgentOpsPerformanceAlertDecision({
      alert,
      controls: resolveAgentOpsPerformanceAlertControls({
        performance_alerts: {
          resolved_fingerprints: {
            [alert!.fingerprint]: {
              resolved_at: '2026-04-30T10:15:00.000Z',
              resolved_by: null,
              resolving_run_id: '22222222-2222-4222-8222-222222222222',
              note: 'Latency recovered after runtime pool restart.',
            },
          },
        },
      }),
    })

    expect(decision).toMatchObject({
      state: 'resolved',
      shouldRecord: false,
      shouldNotify: false,
    })
  })

  it('projects alert history from timeline events and alert controls', () => {
    const history = buildAgentOpsPerformanceAlertHistory({
      events: [{
        id: 'event-1',
        title: 'Agent Ops performance budget breached',
        body: 'p95 latency is over budget.',
        evidence: { status: 'breach' },
        metadata: {
          fingerprint: 'agent-ops:performance-alert:v1:test',
          status: 'breach',
          signal_ids: ['p95_latency'],
        },
        createdAt: '2026-04-30T10:00:00.000Z',
      }],
      controls: resolveAgentOpsPerformanceAlertControls({
        performance_alerts: {
          acknowledged_fingerprints: {
            'agent-ops:performance-alert:v1:test': {
              acknowledged_at: '2026-04-30T10:05:00.000Z',
              acknowledged_by: null,
            },
          },
          resolved_fingerprints: {
            'agent-ops:performance-alert:v1:test': {
              resolved_at: '2026-04-30T10:15:00.000Z',
              resolved_by: null,
              resolving_run_id: '22222222-2222-4222-8222-222222222222',
              note: 'Recovered.',
            },
          },
        },
      }),
    })

    expect(history).toEqual([expect.objectContaining({
      status: 'breach',
      fingerprint: 'agent-ops:performance-alert:v1:test',
      lifecycleState: 'resolved',
      acknowledgedAt: '2026-04-30T10:05:00.000Z',
      resolvedAt: '2026-04-30T10:15:00.000Z',
      resolvingRunId: '22222222-2222-4222-8222-222222222222',
      resolutionNote: 'Recovered.',
      actions: [],
    })])
  })

  it('builds deterministic alert triage actions from budget signals', () => {
    expect(buildAgentOpsPerformanceAlertActions({
      status: 'breach',
      signalIds: ['failure_rate', 'avg_cost'],
    })).toEqual([
      expect.objectContaining({
        id: 'investigate-failures',
        workflowId: 'investigate',
        priority: 'urgent',
      }),
      expect.objectContaining({
        id: 'canary-recovery',
        workflowId: 'canary',
      }),
      expect.objectContaining({
        id: 'benchmark-cost',
        workflowId: 'model-benchmark',
        priority: 'urgent',
      }),
      expect.objectContaining({
        id: 'review-budget-policy',
        workflowId: null,
        priority: 'optional',
      }),
    ])
  })
})
