/**
 * PM Adapter Types — Worker-side Mirror.
 *
 * Mirror of `contracts/pm-adapter.ts`. The canonical source lives in
 * `contracts/` (imported by Next.js src/), but the worker tsconfig has
 * `rootDir: ./src` so it cannot import value modules from outside
 * worker/src. Both copies MUST stay byte-equivalent for the shared
 * shapes — `worker/src/pulse/__tests__/contract-sync.test.ts` enforces
 * this for the other contracts; the PM types are tested by
 * `worker/src/pm-sync/__tests__/contract-sync.test.ts`.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.1
 */

// ============================================================================
// MIRROR REGION (must match contracts/pm-adapter.ts)
// ============================================================================

export type PmProvider = 'linear' | 'asana' | 'trello' | 'monday'
export type PmProviderDbValue = PmProvider | 'jira'

export const PM_PROVIDERS: readonly PmProvider[] = [
  'linear',
  'asana',
  'trello',
  'monday',
] as const

export interface PmIssueRef {
  provider: PmProvider
  externalId: string
  externalUrl: string
  metadata?: Record<string, unknown>
}

export interface HumanWorkItemLite {
  id: string
  orgId: string
  title: string
  description: string | null
  priority: 'critical' | 'high' | 'normal' | 'low'
  labels: string[]
  status: 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled' | 'rejected'
  resolution: string | null
  assigneeUserId: string | null
  assigneeRole: string | null
  dueAt: string | null
  createdAt: string
  updatedAt: string
  dagContext?: {
    dagId: string
    dagNodeId: string
    downstreamBlockedCount: number
  } | null
}

export interface PmIssuePatch {
  title?: string
  description?: string | null
  priority?: HumanWorkItemLite['priority']
  labels?: string[]
  assigneeUserId?: string | null
  dueAt?: string | null
}

export type PmResolution =
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | { custom: string }

export type PmWebhookEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.closed'
  | 'issue.reopened'
  | 'issue.commented'
  | 'agent.session_created'
  | 'agent.session_prompted'
  | 'agent.session_signal'
  | 'unknown'

export interface PmWebhookEvent {
  provider: PmProvider
  type: PmWebhookEventType
  externalId: string
  isEcho: boolean
  actorId?: string
  patch?: PmIssuePatch
  resolution?: PmResolution
  comment?: string
  occurredAt?: string
  agentSessionPayload?: {
    sessionId: string
    issueId: string
    issueIdentifier?: string
    issueTitle?: string
    issueDescription?: string
    triggerType: 'assignment' | 'mention' | 'comment'
    promptContext?: string
    actorId?: string
    actorName?: string
    signal?: string
  }
}

export interface PmAdapterContext {
  orgId: string
  nangoConnectionId: string
  providerConfigKey: string
  providerConfig: Record<string, unknown>
  nowIso(): string
}

export interface OrgPmProviderConfig {
  id: string
  orgId: string
  provider: PmProvider
  enabled: boolean
  isPrimary: boolean
  nangoConnectionId: string
  config: Record<string, unknown>
  webhookSecret?: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export interface PmAdapter {
  readonly provider: PmProvider

  createIssue(wi: HumanWorkItemLite, ctx: PmAdapterContext): Promise<PmIssueRef>

  updateIssue(
    ref: PmIssueRef,
    patch: PmIssuePatch,
    ctx: PmAdapterContext,
  ): Promise<void>

  closeIssue(
    ref: PmIssueRef,
    resolution: PmResolution,
    ctx: PmAdapterContext,
  ): Promise<void>

  fetchStatus(
    ref: PmIssueRef,
    ctx: PmAdapterContext,
  ): Promise<{ externalStatus: string; closed: boolean } | null>

  verifySignature(
    rawBody: string,
    headers: Record<string, string>,
    secret?: string | null,
  ): boolean

  parseWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<PmWebhookEvent | null>

  discoverTransitions?(
    ref: PmIssueRef,
    ctx: PmAdapterContext,
  ): Promise<Record<string, string>>
}

export interface PmSyncJob {
  workItemId: string
  orgId: string
  provider: PmProvider
  operation: 'create' | 'update' | 'close'
  payload?: PmIssuePatch | { resolution: PmResolution }
  attempt: number
}
