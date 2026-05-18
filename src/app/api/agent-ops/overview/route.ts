import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  buildAgentOpsPerformanceAlertHistory,
  buildTeamModeBootstrapPlan,
  buildAgentOpsPerformanceAlert,
  evaluateAgentOpsPerformanceAlertDecision,
  evaluateAgentOpsPerformanceHealth,
  resolveTeamSetupDoctorInstalledRequirementIds,
  resolveAgentOpsPerformanceAlertControls,
  resolveAgentOpsPerformanceBudget,
} from '@/lib/agent-ops/operating-loop'
import { buildAgentOpsQualityGatePackReport } from '@/lib/agent-ops/quality-gate-pack'
import {
  listAgentOpsCompletionAreas,
  summarizeAgentOpsCompletionMatrix,
} from '@/lib/agent-ops/completion-matrix'
import { buildBrowserOperatorConsole } from '@/lib/agent-ops/browser-operator-console'
import { notifyAgentOpsPerformanceAlert } from '@/lib/agent-ops/alert-notifications'
import {
  getAgentOpsPerformanceSummary,
  getAgentOpsProjectPolicy,
  isUserOrgMember,
  listAgentOpsContextSnapshots,
  listAgentOpsBrowserHostPlaybooks,
  listAgentOpsBrowserSecurityEvents,
  listAgentOpsBrowserSessionEvents,
  listAgentOpsBrowserSessionSharedActions,
  listAgentOpsBrowserSessionShares,
  listAgentOpsDecisionEvents,
  listAgentOpsDesignFeedback,
  listAgentOpsEvalRuns,
  listAgentOpsOperatorProfiles,
  listAgentOpsBrowserProcedures,
  listAgentOpsPerformanceAlertTimelineEvents,
  listAgentOpsSecurityAttempts,
  listAgentOpsSpecialistTelemetry,
  listDecisionPreferences,
  listEvalReceipts,
  listProjectLearnings,
  recordAgentOpsProjectTimelineEvent,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const overviewQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = overviewQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      assistantId: req.nextUrl.searchParams.get('assistant_id') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [
      learnings,
      decisionPreferences,
      evalRuns,
      securityAttempts,
      contextSnapshots,
      projectPolicy,
      performance,
      performanceAlertEvents,
      specialistTelemetry,
      browserProcedures,
      browserHostPlaybooks,
      browserSecurityEvents,
      browserSessionEvents,
      browserSessionShares,
      browserSessionSharedActions,
      operatorProfiles,
      designFeedback,
      decisionEvents,
      evalReceipts,
    ] = await Promise.all([
      listProjectLearnings({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        assistantId: parsed.data.assistantId,
        limit: 8,
      }),
      listDecisionPreferences({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsEvalRuns({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsSecurityAttempts({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        assistantId: parsed.data.assistantId,
        limit: 8,
      }),
      listAgentOpsContextSnapshots({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        assistantId: parsed.data.assistantId,
        limit: 5,
      }),
      getAgentOpsProjectPolicy({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
      }),
      getAgentOpsPerformanceSummary({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        assistantId: parsed.data.assistantId,
        windowDays: 14,
      }),
      listAgentOpsPerformanceAlertTimelineEvents({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        assistantId: parsed.data.assistantId,
        limit: 10,
      }),
      listAgentOpsSpecialistTelemetry({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        assistantId: parsed.data.assistantId,
        limit: 12,
      }),
      listAgentOpsBrowserProcedures({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId ?? null,
        trustStates: ['active', 'draft', 'quarantined'],
        limit: 8,
      }),
      listAgentOpsBrowserHostPlaybooks({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId ?? null,
        trustStates: ['active', 'quarantined'],
        limit: 8,
      }),
      listAgentOpsBrowserSecurityEvents({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsBrowserSessionEvents({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsBrowserSessionShares({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsBrowserSessionSharedActions({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsOperatorProfiles({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        userId,
        limit: 8,
      }),
      listAgentOpsDesignFeedback({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
      listAgentOpsDecisionEvents({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 12,
      }),
      listEvalReceipts({
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId,
        limit: 8,
      }),
    ])

    const performanceAlertControls = resolveAgentOpsPerformanceAlertControls(projectPolicy?.metadata)
    const performanceHealth = evaluateAgentOpsPerformanceHealth(
      performance,
      resolveAgentOpsPerformanceBudget(projectPolicy?.metadata),
    )
    const performanceAlert = buildAgentOpsPerformanceAlert({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      assistantId: parsed.data.assistantId,
      health: performanceHealth,
      windowDays: performance.windowDays,
    })
    const performanceAlertDecision = evaluateAgentOpsPerformanceAlertDecision({
      alert: performanceAlert,
      controls: performanceAlertControls,
    })
    const performanceAlertHistory = buildAgentOpsPerformanceAlertHistory({
      events: performanceAlertEvents.map((event) => ({
        id: event.id,
        title: event.title,
        body: event.body,
        evidence: event.evidence,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })),
      controls: performanceAlertControls,
    })
    const teamSetupDoctor = buildTeamModeBootstrapPlan({
      installedRequirementIds: resolveTeamSetupDoctorInstalledRequirementIds(projectPolicy?.metadata, {
        performanceHealthStatus: performanceHealth.status,
        specialistCount: specialistTelemetry.length,
        evalRunCount: evalRuns.length,
        learningCount: learnings.length,
      }),
    })
    const teamSetupRequiredMissingCount = teamSetupDoctor.filter((item) => item.required && item.status === 'missing').length
    const qualityGateReport = buildAgentOpsQualityGatePackReport({
      includeWorkerChecks: false,
    })
    const completionAreas = listAgentOpsCompletionAreas()
    const completionMatrix = {
      summary: summarizeAgentOpsCompletionMatrix(completionAreas),
      areas: completionAreas,
    }
    const browserOperator = buildBrowserOperatorConsole({
      procedures: browserProcedures,
      hostPlaybooks: browserHostPlaybooks,
      securityEvents: browserSecurityEvents,
      sessionEvents: browserSessionEvents,
      sessionShares: browserSessionShares,
      sessionSharedActions: browserSessionSharedActions,
    })

    if (performanceAlertDecision.shouldRecord && performanceAlert && parsed.data.projectId) {
      runAfterResponse(async () => {
        const inserted = await recordAgentOpsProjectTimelineEvent({
          orgId: parsed.data.orgId,
          projectId: parsed.data.projectId,
          eventType: 'agent_ops_performance_alert',
          title: performanceAlert.title,
          body: performanceAlert.body,
          evidence: performanceAlert.evidence,
          metadata: performanceAlert.metadata,
          createdBy: userId,
        })
        if (inserted && performanceAlertDecision.shouldNotify) {
          await notifyAgentOpsPerformanceAlert({
            orgId: parsed.data.orgId,
            projectId: parsed.data.projectId,
            assistantId: parsed.data.assistantId,
            alert: performanceAlert,
          })
        }
      })
    }

    return NextResponse.json({
      learnings,
      decisionPreferences,
      evalRuns,
      securityAttempts,
      contextSnapshots,
      projectPolicy,
      performance,
      performanceHealth,
      performanceAlert,
      performanceAlertDecision,
      performanceAlertHistory,
      specialistTelemetry,
      browserProcedures,
      browserHostPlaybooks,
      browserSecurityEvents,
      browserSessionEvents,
      browserSessionShares,
      browserSessionSharedActions,
      browserOperator,
      operatorProfiles,
      designFeedback,
      decisionEvents,
      evalReceipts,
      teamSetupDoctor,
      qualityGateReport,
      completionMatrix,
      summary: {
        learningCount: learnings.length,
        decisionPreferenceCount: decisionPreferences.length,
        latestEvalScore: evalRuns.find((run) => run.score !== null)?.score ?? null,
        evalReceiptCount: evalReceipts.length,
        latestEvalReceiptVerdict: evalReceipts[0]?.verdict ?? null,
        openSecurityAttemptCount: securityAttempts.filter((attempt) => attempt.status === 'open').length,
        contextSnapshotCount: contextSnapshots.length,
        safetyMode: projectPolicy?.safetyMode ?? 'normal',
        runCount: performance.runCount,
        avgLatencyMs: performance.avgLatencyMs,
        totalCostUsd: performance.totalCostUsd,
        totalTokens: performance.totalTokens,
        performanceHealth: performanceHealth.status,
        specialistCount: specialistTelemetry.length,
        specialistUsefulFindingCount: specialistTelemetry.reduce((sum, specialist) => sum + specialist.usefulFindingCount, 0),
        browserProcedureCount: browserProcedures.length,
        activeBrowserProcedureCount: browserProcedures.filter((procedure) => procedure.trustState === 'active').length,
        browserHostPlaybookCount: browserHostPlaybooks.length,
        activeBrowserHostPlaybookCount: browserHostPlaybooks.filter((playbook) => playbook.trustState === 'active').length,
        browserSecurityEventCount: browserSecurityEvents.length,
        blockingBrowserSecurityEventCount: browserSecurityEvents.filter((event) => event.severity === 'block').length,
        browserSessionEventCount: browserSessionEvents.length,
        browserHandoffRequiredCount: browserSessionEvents.filter((event) => event.eventType === 'handoff_required').length,
        browserSessionShareCount: browserSessionShares.length,
        activeBrowserSessionShareCount: browserSessionShares.filter((share) => share.status === 'active').length,
        browserSessionSharedActionCount: browserSessionSharedActions.length,
        browserOperatorHealth: browserOperator.health,
        browserOperatorActiveSessionCount: browserOperator.summary.activeSessionCount,
        browserOperatorResumableSessionCount: browserOperator.summary.resumableSessionCount,
        operatorProfileCount: operatorProfiles.length,
        designTasteProfileCount: operatorProfiles.filter((profile) => profile.profileType === 'design_taste').length,
        designFeedbackCount: designFeedback.length,
        approvedDesignFeedbackCount: designFeedback.filter((feedback) => feedback.status === 'approved').length,
        teamSetupReadyCount: teamSetupDoctor.filter((item) => item.status === 'ready').length,
        teamSetupRequiredMissingCount,
        qualityGateCount: qualityGateReport.summary.total,
        requiredQualityGateCount: qualityGateReport.summary.required,
        liveQualityGateCount: qualityGateReport.summary.live,
        destructiveQualityGateCount: qualityGateReport.summary.destructive,
        completionAreaCount: completionMatrix.summary.total,
        verifiedCompletionAreaCount: completionMatrix.summary.verified,
        runtimeAgnosticCompletionAreaCount: completionMatrix.summary.runtimeAgnostic,
        completionMatrixGapCount: completionMatrix.summary.missingEvidence.length,
        decisionEventCount: decisionEvents.length,
        askedDecisionCount: decisionEvents.filter((event) => event.decisionMode === 'asked').length,
        silentDecisionCount: decisionEvents.filter((event) => event.decisionMode === 'silent_decision').length,
        flippedDecisionCount: decisionEvents.filter((event) => event.decisionMode === 'flipped').length,
        oneWayDecisionCount: decisionEvents.filter((event) => event.doorType === 'one_way').length,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/overview', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to load Agent Ops overview' }, { status: 500 })
  }
}

function runAfterResponse(task: () => Promise<void>): void {
  const run = () => {
    void task().catch((error) => {
      ErrorService.captureException(error as Error, {
        severity: 'warning',
        context: { endpoint: '/api/agent-ops/overview', operation: 'runAfterResponse' },
        tags: { layer: 'api', route: 'agent-ops' },
      })
    })
  }
  try {
    after(run)
  } catch {
    run()
  }
}
