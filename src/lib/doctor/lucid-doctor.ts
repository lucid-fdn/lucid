import 'server-only'

import type { LucidDoctorDomain, LucidDoctorFinding, LucidDoctorReport } from '@contracts/lucid-doctor'
import type { KnowledgeTrajectoryPoint } from '@contracts/knowledge-intelligence'
import {
  listBrowserOperatorAlerts,
  listKnowledgeMaintenanceEvents,
  listLucidPackManagedResources,
  listSystemNotices,
} from '@/lib/db'
import { listAgentCommerceEvents } from '@/lib/db/agent-commerce'
import { listAgentOpsRunsForOrg } from '@/lib/db/agent-ops'
import { listKnowledgeMetricClaims } from '@/lib/db/knowledge-claims'
import { buildKnowledgeTrajectory, claimToTrajectoryPoint } from '@/lib/knowledge/intelligence/trajectory'

export interface BuildLucidDoctorReportInput {
  orgId: string
  domains?: LucidDoctorDomain[]
  projectId?: string | null
  limit?: number
}

export async function buildLucidDoctorReport(input: BuildLucidDoctorReportInput): Promise<LucidDoctorReport> {
  const requested = new Set(input.domains ?? [])
  const include = (domain: LucidDoctorDomain) => requested.size === 0 || requested.has(domain)
  const jobs: Array<Promise<LucidDoctorFinding[]>> = []
  if (include('knowledge')) jobs.push(knowledgeFindings(input))
  if (include('browser_operator')) jobs.push(browserFindings(input))
  if (include('agent_ops')) jobs.push(agentOpsFindings(input))
  if (include('templates')) jobs.push(templateFindings(input))
  if (include('commerce')) jobs.push(commerceFindings(input))
  if (include('runtimes') || include('channels') || include('l2')) jobs.push(systemNoticeFindings(input, requested))

  const settled = await Promise.allSettled(jobs)
  const findings = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value
    return [sourceFailureFinding(input.orgId, index, result.reason)]
  })
  const deduped = dedupeFindings(findings).slice(0, input.limit ?? 200)
  const summary = {
    total: deduped.length,
    critical: deduped.filter((finding) => finding.severity === 'critical').length,
    warning: deduped.filter((finding) => finding.severity === 'warning').length,
    watch: deduped.filter((finding) => finding.severity === 'watch').length,
  }

  return {
    orgId: input.orgId,
    generatedAt: new Date().toISOString(),
    status: summary.critical > 0 ? 'blocked' : summary.warning + summary.watch > 0 ? 'needs_attention' : 'ready',
    findings: deduped.sort(compareFindings),
    summary,
  }
}

async function knowledgeFindings(input: BuildLucidDoctorReportInput): Promise<LucidDoctorFinding[]> {
  const [events, metricClaims] = await Promise.all([
    listKnowledgeMaintenanceEvents({
      orgId: input.orgId,
      projectId: input.projectId,
      status: 'open',
      limit: 50,
    }),
    listKnowledgeMetricClaims({
      orgId: input.orgId,
      projectId: input.projectId,
      status: 'active',
      limit: 300,
    }),
  ])
  const maintenanceFindings: LucidDoctorFinding[] = events.map((event) => ({
    id: `knowledge:${event.id}`,
    domain: 'knowledge',
    severity: event.severity === 'critical' ? 'critical' : event.severity === 'warning' ? 'warning' : 'watch',
    title: event.title,
    summary: event.summary,
    scope: {
      orgId: event.orgId,
      projectId: event.projectId,
      resourceType: event.claimId ? 'knowledge_claim' : event.sourceId ? 'knowledge_source' : event.pageId ? 'knowledge_page' : 'knowledge',
      resourceId: event.claimId ?? event.sourceId ?? event.pageId ?? event.entityId ?? null,
    },
    evidence: event.evidence.map((evidence) => ({ ...evidence })),
    remediation: [{
      kind: 'ui_action',
      label: 'Open Knowledge maintenance',
      href: '/mission-control/knowledge',
      destructive: false,
    }],
    dedupeKey: `knowledge:${event.eventType}:${event.claimId ?? event.sourceId ?? event.pageId ?? event.id}`,
  }))
  return [...maintenanceFindings, ...trajectoryRegressionFindings(input.orgId, metricClaims)]
}

function trajectoryRegressionFindings(orgId: string, claims: Awaited<ReturnType<typeof listKnowledgeMetricClaims>>): LucidDoctorFinding[] {
  const bySubject = new Map<string, typeof claims>()
  for (const claim of claims) {
    bySubject.set(claim.subject, [...(bySubject.get(claim.subject) ?? []), claim])
  }
  const findings: LucidDoctorFinding[] = []
  for (const [subject, subjectClaims] of bySubject) {
    const points = subjectClaims.map(claimToTrajectoryPoint).filter((point): point is KnowledgeTrajectoryPoint => Boolean(point))
    const trajectory = buildKnowledgeTrajectory({ orgId, subject, points })
    for (const regression of trajectory.regressions) {
      findings.push({
        id: `knowledge_trajectory:${subject}:${regression.metric}:${regression.toClaimId}`,
        domain: 'knowledge',
        severity: regression.severity,
        title: `Knowledge trajectory regression: ${regression.metric}`,
        summary: `${subject} dropped from ${regression.fromValue} to ${regression.toValue} (${Math.round(regression.dropRatio * 100)}%).`,
        scope: {
          orgId,
          projectId: null,
          resourceType: 'knowledge_claim',
          resourceId: regression.toClaimId,
        },
        evidence: [{ subject, metric: regression.metric, fromClaimId: regression.fromClaimId, toClaimId: regression.toClaimId }],
        remediation: [{
          kind: 'ui_action',
          label: 'Open Knowledge',
          href: '/mission-control/knowledge',
          destructive: false,
        }],
        dedupeKey: `knowledge_trajectory:${subject}:${regression.metric}:${regression.toClaimId}`,
      })
    }
  }
  return findings
}

async function browserFindings(input: BuildLucidDoctorReportInput): Promise<LucidDoctorFinding[]> {
  const alerts = await listBrowserOperatorAlerts({
    orgId: input.orgId,
    status: ['open', 'acknowledged'],
    limit: 50,
  })
  return alerts.map((alert) => ({
    id: `browser:${alert.id}`,
    domain: 'browser_operator',
    severity: alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'watch',
    title: alert.title,
    summary: alert.message ?? 'Browser Operator needs attention.',
    scope: {
      orgId: alert.org_id,
      projectId: null,
      resourceType: alert.browser_account_id ? 'browser_account' : alert.purchase_run_id ? 'purchase_run' : 'browser_operator',
      resourceId: alert.browser_account_id ?? alert.purchase_run_id ?? alert.ops_run_id ?? null,
    },
    evidence: [alert.metadata ?? {}],
    remediation: [{
      kind: 'ui_action',
      label: alert.primary_cta?.label ?? 'Open Browser Operator',
      href: alert.href ?? '/mission-control/browser',
      destructive: false,
    }],
    dedupeKey: `browser:${alert.dedupe_key ?? alert.id}`,
  }))
}

async function agentOpsFindings(input: BuildLucidDoctorReportInput): Promise<LucidDoctorFinding[]> {
  const [blocked, failed] = await Promise.all([
    listAgentOpsRunsForOrg(input.orgId, { projectId: input.projectId ?? undefined, status: 'blocked', limit: 25 }),
    listAgentOpsRunsForOrg(input.orgId, { projectId: input.projectId ?? undefined, status: 'failed', limit: 25 }),
  ])
  return [...blocked, ...failed].map((run) => ({
    id: `agent_ops:${run.id}`,
    domain: 'agent_ops',
    severity: run.status === 'blocked' ? 'warning' : 'critical',
    title: run.status === 'blocked' ? 'Agent Ops run is blocked' : 'Agent Ops run failed',
    summary: run.errorMessage ?? `${run.workflowId} is ${run.status}.`,
    scope: {
      orgId: run.orgId,
      projectId: run.projectId ?? null,
      resourceType: 'agent_ops_run',
      resourceId: run.id,
    },
    evidence: [{ workflowId: run.workflowId, status: run.status, metadata: run.metadata }],
    remediation: [{
      kind: 'ui_action',
      label: 'Open run detail',
      href: `/mission-control/runs/${run.id}`,
      destructive: false,
    }],
    dedupeKey: `agent_ops:${run.id}:${run.status}`,
  }))
}

async function templateFindings(input: BuildLucidDoctorReportInput): Promise<LucidDoctorFinding[]> {
  const resources = await listLucidPackManagedResources({
    orgId: input.orgId,
    status: 'drifted',
    limit: 50,
  })
  return resources.map((resource) => ({
    id: `templates:${resource.id}`,
    domain: 'templates',
    severity: 'watch',
    title: 'Template managed resource drifted',
    summary: `${resource.resourceKind} ${resource.resourceKey} drifted from its Lucid Pack definition.`,
    scope: {
      orgId: resource.orgId,
      projectId: null,
      resourceType: resource.resourceKind,
      resourceId: resource.resourceId ?? resource.id,
    },
    evidence: [{ installId: resource.installId, resourceKey: resource.resourceKey, specHash: resource.specHash, metadata: resource.metadata }],
    remediation: [{
      kind: 'ui_action',
      label: 'Open template install health',
      href: '/templates',
      destructive: false,
    }],
    dedupeKey: `templates:${resource.id}:drifted`,
  }))
}

async function commerceFindings(input: BuildLucidDoctorReportInput): Promise<LucidDoctorFinding[]> {
  const events = await listAgentCommerceEvents({
    orgId: input.orgId,
    limit: 50,
  })
  return events
    .filter((event) => /blocked|failed|exception|fallback|missing|risk/i.test(event.event_type))
    .map((event) => ({
      id: `commerce:${event.id}`,
      domain: 'commerce',
      severity: /blocked|failed/i.test(event.event_type) ? 'warning' : 'watch',
      title: 'Commerce event needs review',
      summary: event.event_type,
      scope: {
        orgId: event.org_id,
        projectId: null,
        resourceType: event.entity_type,
        resourceId: event.entity_id,
      },
      evidence: [event.payload ?? {}],
      remediation: [{
        kind: 'ui_action',
        label: 'Open Commerce Mission Control',
        href: '/mission-control/commerce',
        destructive: false,
      }],
      dedupeKey: `commerce:${event.id}`,
    }))
}

async function systemNoticeFindings(input: BuildLucidDoctorReportInput, requested: Set<LucidDoctorDomain>): Promise<LucidDoctorFinding[]> {
  const notices = await listSystemNotices({
    orgId: input.orgId,
    projectId: input.projectId,
    unresolvedOnly: true,
    limit: 75,
  })
  const findings: Array<LucidDoctorFinding | null> = notices
    .map((notice) => {
      const domain = notice.type === 'runtime_incompatible' ? 'runtimes'
        : notice.type === 'channel_report_ready' ? 'channels'
          : notice.type === 'l2_projection_failed' ? 'l2'
            : null
      if (!domain || (requested.size > 0 && !requested.has(domain))) return null
      return {
        id: `notice:${notice.id}`,
        domain,
        severity: notice.tone === 'danger' ? 'critical' : notice.tone === 'warning' ? 'warning' : 'watch',
        title: notice.title,
        summary: notice.body,
        scope: {
          orgId: notice.orgId,
          projectId: notice.projectId ?? null,
          resourceType: notice.runId ? 'agent_ops_run' : 'system_notice',
          resourceId: notice.runId ?? notice.id,
        },
        evidence: [notice.details],
        remediation: notice.actions.map((action) => ({
          kind: 'ui_action' as const,
          label: action.label,
          href: action.href ?? null,
          destructive: false,
        })),
        dedupeKey: `notice:${notice.dedupeKey ?? notice.id}`,
      } satisfies LucidDoctorFinding
    })
  return findings.filter((finding): finding is LucidDoctorFinding => Boolean(finding))
}

function sourceFailureFinding(orgId: string, index: number, reason: unknown): LucidDoctorFinding {
  return {
    id: `doctor_source_failure:${index}`,
    domain: 'env',
    severity: 'warning',
    title: 'Doctor source failed',
    summary: reason instanceof Error ? reason.message : 'A doctor source failed while building the report.',
    scope: { orgId, projectId: null, resourceType: 'doctor_source', resourceId: String(index) },
    evidence: [],
    remediation: [{ kind: 'manual', label: 'Check server logs for this doctor source.', destructive: false }],
    dedupeKey: `doctor_source_failure:${index}`,
  }
}

function dedupeFindings(findings: LucidDoctorFinding[]): LucidDoctorFinding[] {
  const byKey = new Map<string, LucidDoctorFinding>()
  for (const finding of findings) {
    const existing = byKey.get(finding.dedupeKey)
    if (!existing || severityRank(finding.severity) > severityRank(existing.severity)) {
      byKey.set(finding.dedupeKey, finding)
    }
  }
  return Array.from(byKey.values())
}

function compareFindings(a: LucidDoctorFinding, b: LucidDoctorFinding): number {
  const severityDelta = severityRank(b.severity) - severityRank(a.severity)
  if (severityDelta !== 0) return severityDelta
  return a.title.localeCompare(b.title)
}

function severityRank(severity: LucidDoctorFinding['severity']): number {
  return severity === 'critical' ? 4 : severity === 'warning' ? 3 : severity === 'watch' ? 2 : 1
}
