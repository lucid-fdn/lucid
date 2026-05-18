/**
 * Linear Adapter — Worker-side implementation.
 *
 * Implements the full `PmAdapter` contract for Linear.app via its GraphQL
 * API proxied through Nango. Handles:
 *   - Webhook signature verification (HMAC-SHA256 hex in `linear-signature`)
 *   - Webhook payload parsing into the normalized `PmWebhookEvent` shape
 *   - Outbound create / update / close against Linear's GraphQL mutations
 *   - Reconcile fetchStatus reads for drift detection
 *
 * Linear webhook payload shape (stable, documented):
 *   {
 *     action: 'create' | 'update' | 'remove',
 *     type: 'Issue' | 'Comment' | ...,
 *     data: { id, title, description, priority, state: { type, name }, ... },
 *     updatedFrom?: { ...fields that changed... },
 *     webhookId: string,
 *     webhookTimestamp: number,
 *     actor?: { id, name, email },
 *     createdAt: string,
 *   }
 *
 * Linear priority integer map (canonical):
 *   0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
 *
 * Linear state.type values (workflow state category):
 *   backlog | unstarted | started | completed | canceled | triage
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.1
 */

import type {
  HumanWorkItemLite,
  PmAdapter,
  PmAdapterContext,
  PmIssuePatch,
  PmResolution,
  PmWebhookEvent,
  PmWebhookEventType,
} from '../../types.js'
import { hmacSha256, timingSafeEqual } from '../../webhook-verify.js'
import { PmSyncError, PmSyncMappingError } from '../../errors.js'
import { buildDescription, LUCID_MARKER_REGEX } from '../../description-builder.js'
import { requireNangoClient, handleNangoError } from '../../nango-helpers.js'

// ─── Field maps (Linear-specific) ──────────────────────────────────────────

/** Linear priority integer → Lucid priority. */
const LINEAR_PRIORITY_TO_LUCID: Record<number, HumanWorkItemLite['priority']> = {
  0: 'normal', // "No priority" → treat as normal
  1: 'critical', // Urgent
  2: 'high',
  3: 'normal', // Linear "Medium"
  4: 'low',
}

/** Lucid priority → Linear integer. */
const LUCID_PRIORITY_TO_LINEAR: Record<HumanWorkItemLite['priority'], number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
}

/** Linear state.type → Lucid status. */
function linearStateToStatus(
  stateType: string | undefined | null,
): HumanWorkItemLite['status'] {
  switch (stateType) {
    case 'backlog':
    case 'unstarted':
    case 'triage':
      return 'open'
    case 'started':
      return 'in_progress'
    case 'completed':
      return 'done'
    case 'canceled':
      return 'cancelled'
    default:
      return 'open'
  }
}


// ─── GraphQL client (via Nango proxy) ──────────────────────────────────────

interface LinearGraphQlResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>
}

async function linearGraphql<T>(
  ctx: PmAdapterContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const nango = requireNangoClient('linear')
  try {
    const response = await nango.post({
      connectionId: ctx.nangoConnectionId,
      providerConfigKey: ctx.providerConfigKey,
      endpoint: '/graphql',
      data: { query, variables },
      headers: { 'Content-Type': 'application/json' },
      retries: 3,
    })
    const body = response.data as LinearGraphQlResponse<T>
    if (body.errors && body.errors.length > 0) {
      throw new PmSyncError(
        `Linear GraphQL error: ${body.errors.map((e) => e.message).join('; ')}`,
        { provider: 'linear', retryable: false, cause: body.errors },
      )
    }
    if (!body.data) {
      throw new PmSyncError('Linear GraphQL returned no data', {
        provider: 'linear',
        retryable: false,
      })
    }
    return body.data
  } catch (err) {
    handleNangoError(err, 'linear', 'Linear GraphQL request failed')
  }
}

// ─── GraphQL operations ────────────────────────────────────────────────────

const CREATE_ISSUE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`

const UPDATE_ISSUE_MUTATION = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
    }
  }
`

const FETCH_ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
      id
      state { id name type }
      completedAt
      canceledAt
    }
  }
`

// ─── The adapter ───────────────────────────────────────────────────────────

export const linearAdapter: PmAdapter = {
  provider: 'linear',

  async createIssue(wi, ctx) {
    const teamId = (ctx.providerConfig.teamId ?? ctx.providerConfig.team_id) as
      | string
      | undefined
    if (!teamId) {
      throw new PmSyncMappingError(
        'Linear adapter requires `teamId` in org_pm_config.config',
        { provider: 'linear' },
      )
    }

    const input: Record<string, unknown> = {
      teamId,
      title: wi.title,
      description: buildDescription(wi, 'markdown'),
      priority: LUCID_PRIORITY_TO_LINEAR[wi.priority] ?? 3,
    }
    if (wi.labels.length > 0) {
      // Labels are passed as ids in Linear; the org_pm_config.config can supply
      // a label name → id map to resolve Lucid label names to Linear ids.
      const labelMap = (ctx.providerConfig.labelMap ?? ctx.providerConfig.label_map) as
        | Record<string, string>
        | undefined
      if (labelMap) {
        const ids = wi.labels
          .map((name) => labelMap[name])
          .filter((x): x is string => typeof x === 'string')
        if (ids.length > 0) input.labelIds = ids
      }
    }
    if (wi.dueAt) {
      input.dueDate = wi.dueAt.slice(0, 10) // Linear expects YYYY-MM-DD
    }

    const data = await linearGraphql<{
      issueCreate: {
        success: boolean
        issue: { id: string; identifier: string; url: string } | null
      }
    }>(ctx, CREATE_ISSUE_MUTATION, { input })

    if (!data.issueCreate.success || !data.issueCreate.issue) {
      throw new PmSyncError('Linear issueCreate returned success=false', {
        provider: 'linear',
        retryable: true,
      })
    }

    const issue = data.issueCreate.issue
    return {
      provider: 'linear',
      externalId: issue.id,
      externalUrl: issue.url,
      metadata: { identifier: issue.identifier, teamId },
    }
  },

  async updateIssue(ref, patch, ctx) {
    const input: Record<string, unknown> = {}
    if (patch.title !== undefined) input.title = patch.title
    if (patch.description !== undefined) input.description = patch.description ?? ''
    if (patch.priority !== undefined) {
      input.priority = LUCID_PRIORITY_TO_LINEAR[patch.priority] ?? 3
    }
    if (patch.dueAt !== undefined) {
      input.dueDate = patch.dueAt ? patch.dueAt.slice(0, 10) : null
    }
    if (Object.keys(input).length === 0) return

    const data = await linearGraphql<{ issueUpdate: { success: boolean } }>(
      ctx,
      UPDATE_ISSUE_MUTATION,
      { id: ref.externalId, input },
    )
    if (!data.issueUpdate.success) {
      throw new PmSyncError('Linear issueUpdate returned success=false', {
        provider: 'linear',
        retryable: true,
      })
    }
  },

  async closeIssue(ref, resolution, ctx) {
    // Close = move issue to a "done" or "canceled" workflow state. The state
    // ids are provider-specific and must be supplied in org_pm_config.config:
    //   doneStateId, cancelledStateId
    const config = ctx.providerConfig as Record<string, unknown>
    const doneStateId =
      (config.doneStateId as string | undefined) ??
      (config.done_state_id as string | undefined)
    const cancelledStateId =
      (config.cancelledStateId as string | undefined) ??
      (config.cancelled_state_id as string | undefined)

    const isCancel =
      resolution === 'cancelled' ||
      resolution === 'rejected' ||
      (typeof resolution === 'object' && resolution.custom === 'cancelled')
    const stateId = isCancel ? cancelledStateId : doneStateId
    if (!stateId) {
      throw new PmSyncMappingError(
        `Linear adapter requires ${isCancel ? 'cancelledStateId' : 'doneStateId'} in org_pm_config.config`,
        { provider: 'linear' },
      )
    }

    const data = await linearGraphql<{ issueUpdate: { success: boolean } }>(
      ctx,
      UPDATE_ISSUE_MUTATION,
      { id: ref.externalId, input: { stateId } },
    )
    if (!data.issueUpdate.success) {
      throw new PmSyncError('Linear close (issueUpdate) returned success=false', {
        provider: 'linear',
        retryable: true,
      })
    }
  },

  async fetchStatus(ref, ctx) {
    try {
      const data = await linearGraphql<{
        issue: {
          id: string
          state: { id: string; name: string; type: string }
          completedAt: string | null
          canceledAt: string | null
        } | null
      }>(ctx, FETCH_ISSUE_QUERY, { id: ref.externalId })
      if (!data.issue) return null
      const closed =
        data.issue.state.type === 'completed' || data.issue.state.type === 'canceled'
      return {
        externalStatus: data.issue.state.type,
        closed,
      }
    } catch (err) {
      // Issue not found → null. Any other failure bubbles.
      if (err instanceof PmSyncError && !err.retryable) {
        return null
      }
      throw err
    }
  },

  verifySignature(rawBody, headers, secret) {
    if (!secret) return false
    const received =
      headers['linear-signature'] ??
      headers['Linear-Signature'] ??
      headers['LINEAR-SIGNATURE']
    if (!received || typeof received !== 'string') return false
    const expected = hmacSha256(secret, rawBody)
    return timingSafeEqual(received, expected)
  },

  async parseWebhook(payload, _headers) {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>

    // ─── AgentSession events (Linear Agents API) ──────────────────────
    if (p.type === 'AgentSession') {
      return parseAgentSessionWebhook(p)
    }

    // Ignore non-Issue events (Comment, Reaction, Project, etc.)
    if (p.type !== 'Issue') return null

    const action = p.action as string | undefined
    const data = p.data as Record<string, unknown> | undefined
    if (!data || typeof data.id !== 'string') return null

    // Type mapping
    let type: PmWebhookEventType = 'unknown'
    if (action === 'create') type = 'issue.created'
    else if (action === 'update') {
      // Decide closed vs updated vs reopened by inspecting state transitions.
      const state = data.state as { type?: string } | undefined
      const updatedFrom = p.updatedFrom as
        | { stateId?: string; state?: { type?: string } }
        | undefined
      const prevStateType = updatedFrom?.state?.type
      const currStateType = state?.type
      if (
        prevStateType &&
        currStateType &&
        prevStateType !== currStateType &&
        (currStateType === 'completed' || currStateType === 'canceled')
      ) {
        type = 'issue.closed'
      } else if (
        prevStateType &&
        currStateType &&
        (prevStateType === 'completed' || prevStateType === 'canceled') &&
        currStateType !== prevStateType
      ) {
        type = 'issue.reopened'
      } else {
        type = 'issue.updated'
      }
    } else if (action === 'remove') {
      type = 'issue.closed'
    }

    // Echo guard: if the description contains our hidden marker AND the
    // actor id matches an injected sync-bot id supplied at parse time via
    // headers (we don't have access here), we still can't be 100% sure —
    // but the marker alone isn't a true echo signal. Use updatedFrom to see
    // if ONLY fields we write were touched. Conservative: mark isEcho=false
    // and let the dispatcher's dedupe handle repeated deliveries. A dedicated
    // echo guard lives in the sync-bot actor-id check at the outbound layer.
    const description = (data.description as string | undefined) ?? ''
    const hasMarker = LUCID_MARKER_REGEX.test(description)

    // Build patch for update-type events (best-effort — Linear webhooks
    // include the full current state, not just the diff).
    const patch: PmIssuePatch = {}
    if (typeof data.title === 'string') patch.title = data.title
    if (typeof data.description === 'string') patch.description = data.description
    if (typeof data.priority === 'number') {
      patch.priority = LINEAR_PRIORITY_TO_LUCID[data.priority] ?? 'normal'
    }
    if (typeof data.dueDate === 'string') patch.dueAt = data.dueDate

    const actor = p.actor as { id?: string } | undefined
    const createdAt = p.createdAt as string | undefined

    // Resolution for closed events
    let resolution: PmResolution | undefined
    if (type === 'issue.closed') {
      const state = data.state as { type?: string } | undefined
      if (state?.type === 'canceled') resolution = 'cancelled'
      else if (state?.type === 'completed') resolution = 'completed'
    }

    return {
      provider: 'linear',
      type,
      externalId: data.id,
      isEcho: hasMarker && type === 'issue.updated', // conservative: only suppress update echoes
      actorId: actor?.id,
      patch: Object.keys(patch).length > 0 ? patch : undefined,
      resolution,
      occurredAt: createdAt,
    }
  },
}

// ─── Agent Session webhook parser ───────────────────────────────────────

/**
 * Parse a Linear AgentSession webhook payload into a PmWebhookEvent.
 *
 * Linear sends:
 *   {
 *     type: 'AgentSession',
 *     action: 'create' | 'update',
 *     data: { id, issueId, issue?: { id, identifier, title, description, url }, ... },
 *     actor?: { id, name },
 *     createdAt: string,
 *   }
 */
function parseAgentSessionWebhook(
  p: Record<string, unknown>,
): PmWebhookEvent | null {
  const action = p.action as string | undefined
  const data = p.data as Record<string, unknown> | undefined
  if (!data || typeof data.id !== 'string') return null

  const sessionId = data.id as string
  const issueId = (data.issueId ?? data.issue_id) as string | undefined
  if (!issueId) return null

  // Determine event type based on action and data shape
  let type: PmWebhookEventType
  if (action === 'create') {
    type = 'agent.session_created'
  } else if (action === 'update') {
    // Check if this is a signal event (has promptContext or signal data)
    const signal = data.signal as string | undefined
    if (signal) {
      type = 'agent.session_signal'
    } else {
      type = 'agent.session_prompted'
    }
  } else {
    return null
  }

  // Extract issue details from nested issue object
  const issue = data.issue as Record<string, unknown> | undefined
  const actor = p.actor as { id?: string; name?: string } | undefined
  const createdAt = p.createdAt as string | undefined

  // Determine trigger type from the data
  let triggerType: 'assignment' | 'mention' | 'comment' = 'assignment'
  const rawTrigger = data.triggerType as string | undefined
  if (rawTrigger === 'mention' || rawTrigger === 'comment') {
    triggerType = rawTrigger
  } else if (rawTrigger === 'assignment') {
    triggerType = 'assignment'
  }

  return {
    provider: 'linear',
    type,
    externalId: issueId,
    isEcho: false,
    actorId: actor?.id,
    occurredAt: createdAt,
    agentSessionPayload: {
      sessionId,
      issueId,
      issueIdentifier: (issue?.identifier as string) ?? undefined,
      issueTitle: (issue?.title as string) ?? undefined,
      issueDescription: (issue?.description as string) ?? undefined,
      triggerType,
      promptContext: (data.promptContext as string) ?? undefined,
      actorId: actor?.id,
      actorName: actor?.name,
      signal: (data.signal as string) ?? undefined,
    },
  }
}
