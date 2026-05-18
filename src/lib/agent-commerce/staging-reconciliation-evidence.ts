import { z } from 'zod'
import type { AgentCommerceEvent } from '@contracts/agent-commerce'

export const AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE = [
  'seven_day_reconciliation_job_history',
  'stale_approval_reconciliation_log',
  'stuck_credential_reconciliation_log',
  'provider_mismatch_triage_log',
  'zero_untriaged_p0_p1_commerce_incidents',
] as const

export type AgentCommerceStagingReconciliationEvidenceId =
  typeof AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE[number]

export const AgentCommerceStagingReconciliationEvidenceSummarySchema = z.object({
  ready: z.boolean(),
  evidence: z.array(z.enum(AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE)),
  missingEvidence: z.array(z.enum(AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE)),
  window: z.object({
    start_at: z.string(),
    end_at: z.string(),
    days: z.number().int().positive(),
    required_run_days: z.number().int().positive(),
  }),
  observed_run_days: z.array(z.string()),
  total_runs: z.number().int().nonnegative(),
  total_updates: z.number().int().nonnegative(),
  stale_approval_reconciled_count: z.number().int().nonnegative(),
  stuck_credential_reconciled_count: z.number().int().nonnegative(),
  provider_mismatch_triage_count: z.number().int().nonnegative(),
  untriaged_p0_p1_incidents: z.number().int().nonnegative().optional(),
})

export type AgentCommerceStagingReconciliationEvidenceSummary = z.infer<
  typeof AgentCommerceStagingReconciliationEvidenceSummarySchema
>

type ReconciliationEvent = Pick<AgentCommerceEvent, 'event_type' | 'payload' | 'created_at'>

interface ReconciliationAction {
  entity_type?: string
  action?: string
  updated_count?: number
}

export interface AgentCommerceStagingReconciliationEvidenceInput {
  events: ReconciliationEvent[]
  now?: string
  windowDays?: number
  requiredRunDays?: number
  untriagedP0P1IncidentCount?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asActions(value: unknown): ReconciliationAction[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asRecord(item))
    .map((item) => ({
      entity_type: typeof item.entity_type === 'string' ? item.entity_type : undefined,
      action: typeof item.action === 'string' ? item.action : undefined,
      updated_count: Number.isFinite(Number(item.updated_count)) ? Number(item.updated_count) : 0,
    }))
}

function eventDate(event: ReconciliationEvent): Date | null {
  const payload = asRecord(event.payload)
  const value = typeof payload.ran_at === 'string' ? payload.ran_at : event.created_at
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function hasEvidence(
  evidence: Set<AgentCommerceStagingReconciliationEvidenceId>,
  id: AgentCommerceStagingReconciliationEvidenceId,
): boolean {
  return evidence.has(id)
}

export function summarizeAgentCommerceStagingReconciliationEvidence(
  input: AgentCommerceStagingReconciliationEvidenceInput,
): AgentCommerceStagingReconciliationEvidenceSummary {
  const now = new Date(input.now ?? new Date().toISOString())
  const windowDays = Math.max(1, Math.floor(input.windowDays ?? 7))
  const requiredRunDays = Math.max(1, Math.floor(input.requiredRunDays ?? windowDays))
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - (windowDays - 1))
  start.setUTCHours(0, 0, 0, 0)

  const reconciliationEvents = input.events
    .filter((event) => event.event_type === 'reconciliation.completed')
    .map((event) => ({ event, date: eventDate(event) }))
    .filter((item): item is { event: ReconciliationEvent; date: Date } => Boolean(item.date))
    .filter((item) => item.date >= start && item.date <= now)

  const runDays = new Set(reconciliationEvents.map((item) => dayKey(item.date)))
  let totalUpdates = 0
  let staleApprovalCount = 0
  let stuckCredentialCount = 0
  let providerMismatchTriageCount = 0
  let sawStaleApprovalCheck = false
  let sawStuckCredentialCheck = false
  let sawProviderMismatchCheck = false

  for (const { event } of reconciliationEvents) {
    const payload = asRecord(event.payload)
    if (Object.prototype.hasOwnProperty.call(payload, 'provider_event_mismatches')) {
      sawProviderMismatchCheck = true
      const mismatchCount = Number(payload.provider_event_mismatches ?? 0)
      providerMismatchTriageCount += Number.isFinite(mismatchCount) ? Math.max(0, mismatchCount) : 0
    }

    for (const action of asActions(payload.actions)) {
      const updatedCount = Math.max(0, action.updated_count ?? 0)
      totalUpdates += updatedCount
      if (action.entity_type === 'spend_request' && action.action === 'expired') {
        sawStaleApprovalCheck = true
        staleApprovalCount += updatedCount
      }
      if (
        action.entity_type === 'spend_request'
        && (
          action.action === 'failed_stuck_credential_issuing'
          || action.action === 'credential_issuing_stuck'
        )
      ) {
        sawStuckCredentialCheck = true
        stuckCredentialCount += updatedCount
      }
    }
  }

  const evidence = new Set<AgentCommerceStagingReconciliationEvidenceId>()
  if (runDays.size >= requiredRunDays) evidence.add('seven_day_reconciliation_job_history')
  if (sawStaleApprovalCheck) evidence.add('stale_approval_reconciliation_log')
  if (sawStuckCredentialCheck) evidence.add('stuck_credential_reconciliation_log')
  if (sawProviderMismatchCheck) evidence.add('provider_mismatch_triage_log')
  if (input.untriagedP0P1IncidentCount === 0) {
    evidence.add('zero_untriaged_p0_p1_commerce_incidents')
  }

  const missingEvidence = AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE
    .filter((id) => !hasEvidence(evidence, id))

  return AgentCommerceStagingReconciliationEvidenceSummarySchema.parse({
    ready: missingEvidence.length === 0,
    evidence: [...evidence],
    missingEvidence,
    window: {
      start_at: start.toISOString(),
      end_at: now.toISOString(),
      days: windowDays,
      required_run_days: requiredRunDays,
    },
    observed_run_days: [...runDays].sort(),
    total_runs: reconciliationEvents.length,
    total_updates: totalUpdates,
    stale_approval_reconciled_count: staleApprovalCount,
    stuck_credential_reconciled_count: stuckCredentialCount,
    provider_mismatch_triage_count: providerMismatchTriageCount,
    untriaged_p0_p1_incidents: input.untriagedP0P1IncidentCount,
  })
}
