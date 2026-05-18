/**
 * PM Adapter Contracts — Shared Types
 *
 * Universal contract for external PM tool adapters (Linear, Asana, Trello, Monday).
 * Shared between:
 * - src/ (control plane: webhook receivers, reconcile cron reads, config API)
 * - worker/ (outbound sync worker, reconcile cron writes)
 *
 * NO framework dependencies. Pure TypeScript. Adapters are intentionally duplicated
 * across src/lib/pm-sync/ and worker/src/pm-sync/ because worker/ cannot import
 * from src/. Only the shapes in this file travel on the wire.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.1
 */

// ─── Providers ──────────────────────────────────────────────────────────────────

/**
 * Supported external PM providers. Jira is reserved but not implemented in
 * the initial rollout — the `'jira'` literal is intentionally absent so the
 * type exhaustively covers only the four shipping adapters.
 */
export type PmProvider = 'linear' | 'asana' | 'trello' | 'monday'

/** Wider string literal including reserved providers. Use when reading DB rows. */
export type PmProviderDbValue = PmProvider | 'jira'

export const PM_PROVIDERS: readonly PmProvider[] = [
  'linear',
  'asana',
  'trello',
  'monday',
] as const

// ─── Issue references ───────────────────────────────────────────────────────────

/**
 * A pointer to a single external issue/card/task. Stored in
 * `work_item_external_refs` — one row per (work_item_id, provider).
 */
export interface PmIssueRef {
  provider: PmProvider
  /** Provider-native identifier (Linear issue UUID, Trello card id, etc.) */
  externalId: string
  /** Deep-link URL for operators. Must be stable. */
  externalUrl: string
  /** Provider-specific metadata (team id, project id, board id, …). */
  metadata?: Record<string, unknown>
}

// ─── Work item snapshot (kind-agnostic) ─────────────────────────────────────────

/**
 * The minimal shape an adapter needs to create/update an external issue.
 * Built from `human_work_items` + optional DAG context via
 * `buildWorkItemLite()` in src/lib/pm-sync/shared/work-item-lite.ts.
 *
 * Intentionally does NOT expose `kind` — adapters must treat pulse_standalone
 * and nerve_node work items identically. Kind only matters inside
 * `completeWorkItem()` when closing the DAG loop.
 */
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
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601 */
  updatedAt: string
  /**
   * Optional DAG context used by the description builder to show downstream
   * blocking information. Populated only for `nerve_node` work items.
   */
  dagContext?: {
    dagId: string
    dagNodeId: string
    downstreamBlockedCount: number
  } | null
}

/**
 * Patch passed to `updateIssue()`. All fields optional — only supplied fields
 * are applied. Adapters must treat unspecified fields as "leave alone".
 */
export interface PmIssuePatch {
  title?: string
  description?: string | null
  priority?: HumanWorkItemLite['priority']
  labels?: string[]
  assigneeUserId?: string | null
  dueAt?: string | null
}

/** Resolution passed to `closeIssue()`. */
export type PmResolution =
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | { custom: string }

// ─── Webhook events ─────────────────────────────────────────────────────────────

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

/**
 * Normalized webhook event produced by `PmAdapter.parseWebhook()`. Webhook
 * routes use only fields on this shape — provider-specific payloads are
 * fully contained inside the adapter.
 */
export interface PmWebhookEvent {
  provider: PmProvider
  type: PmWebhookEventType
  /** Provider-native issue id — used to look up the mirror row. */
  externalId: string
  /**
   * Echo-loop guard. When `true`, the webhook originated from a Lucid sync
   * operation — callers should short-circuit instead of re-applying.
   */
  isEcho: boolean
  /**
   * Provider-supplied actor id (if any). Used to skip echoes where the
   * acting user matches the Lucid sync bot identity.
   */
  actorId?: string
  /** Patch to apply to the mirror (title/labels/etc.). */
  patch?: PmIssuePatch
  /** Present on `issue.closed` events only. */
  resolution?: PmResolution
  /** Raw comment body on `issue.commented` events. */
  comment?: string
  /**
   * Timestamp (ISO 8601) of when the provider claims the event occurred.
   * Used for ordering / staleness comparisons during reconcile.
   */
  occurredAt?: string
  /**
   * Linear Agents API session payload. Present on `agent.session_created`,
   * `agent.session_prompted`, and `agent.session_signal` events only.
   */
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

// ─── Adapter context (per call) ─────────────────────────────────────────────────

/**
 * Per-request context handed to every adapter method. Holds the
 * Nango connection identity and the org's provider-specific config
 * (team id, board id, project id, workspace slug, …).
 *
 * Adapters MUST use `nangoProxyFetch()` for all HTTP — never raw fetch —
 * so retries, auth refresh, and rate-limit handling are centralized.
 */
export interface PmAdapterContext {
  orgId: string
  nangoConnectionId: string
  /**
   * Nango provider config key (e.g., 'linear', 'asana'). Usually mirrors
   * `provider` but kept separate so Nango naming can drift independently.
   */
  providerConfigKey: string
  /** Provider-specific config from `org_pm_config.config`. */
  providerConfig: Record<string, unknown>
  /** Monotonic clock. Injected for deterministic tests / reconcile ordering. */
  nowIso(): string
}

// ─── Org provider config (DB row shape on the wire) ─────────────────────────────

/**
 * Row shape returned by `getOrgPmConfig()`. Stored in `org_pm_config`.
 * `webhookSecret` is only present when the caller has permission to read
 * secrets — most API responses strip it.
 */
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

// ─── The adapter interface ──────────────────────────────────────────────────────

/**
 * Universal PM adapter contract. Every provider implementation is a thin
 * object implementing this interface (~150-250 LOC per adapter). All
 * divergence between pulse_standalone vs nerve_node work items is
 * contained inside `completeWorkItem()` on the DB layer — adapters are
 * kind-agnostic.
 */
export interface PmAdapter {
  readonly provider: PmProvider

  /** Create a new external issue and return the ref to store. */
  createIssue(wi: HumanWorkItemLite, ctx: PmAdapterContext): Promise<PmIssueRef>

  /** Apply a partial update to an existing external issue. */
  updateIssue(
    ref: PmIssueRef,
    patch: PmIssuePatch,
    ctx: PmAdapterContext,
  ): Promise<void>

  /** Close/resolve the external issue with the given resolution. */
  closeIssue(
    ref: PmIssueRef,
    resolution: PmResolution,
    ctx: PmAdapterContext,
  ): Promise<void>

  /**
   * Fetch the current status of the external issue. Used by the reconcile
   * cron to detect drift. Returns `null` if the issue no longer exists.
   */
  fetchStatus(
    ref: PmIssueRef,
    ctx: PmAdapterContext,
  ): Promise<{ externalStatus: string; closed: boolean } | null>

  /**
   * Verify the webhook signature against the raw body + headers.
   * Return `false` to reject the webhook before any parsing happens.
   * `secret` is the org-specific webhook secret loaded from
   * `org_pm_config.webhook_secret`. Adapters that don't need a secret
   * (e.g., providers that use OAuth-signed requests) may ignore it.
   */
  verifySignature(
    rawBody: string,
    headers: Record<string, string>,
    secret?: string | null,
  ): boolean

  /**
   * Parse a provider-specific webhook payload into a normalized
   * `PmWebhookEvent`. Return `null` to drop the webhook silently
   * (e.g., ping/test events).
   */
  parseWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<PmWebhookEvent | null>

  /**
   * Jira-only: discover the workflow transition ids for a given issue so
   * `closeIssue()` can pick the right transition. Other providers omit this.
   */
  discoverTransitions?(
    ref: PmIssueRef,
    ctx: PmAdapterContext,
  ): Promise<Record<string, string>>
}

// ─── Sync queue job shape (Pulse payload) ───────────────────────────────────────

/**
 * Payload carried on the `pm_sync_outbound` Pulse queue. The sync worker
 * pops these and dispatches to the appropriate adapter.
 */
export interface PmSyncJob {
  workItemId: string
  orgId: string
  provider: PmProvider
  operation: 'create' | 'update' | 'close'
  /** Patch shape for 'update'; resolution for 'close'. */
  payload?: PmIssuePatch | { resolution: PmResolution }
  /** Retry attempt (0 = first try). */
  attempt: number
}
