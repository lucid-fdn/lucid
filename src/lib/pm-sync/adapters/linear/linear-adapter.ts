/**
 * Linear Adapter — Control-plane implementation.
 *
 * The control plane only exercises `verifySignature` + `parseWebhook` via
 * the webhook dispatcher. Outbound calls (create/update/close/fetchStatus)
 * run on the worker where the Nango client lives. The methods are still
 * implemented on this side so the adapter satisfies the full `PmAdapter`
 * contract, but they use `nangoProxyFetch()` from `src/lib/oauth/nango-fetch`
 * which lives on the control plane and speaks to the same Nango backend.
 *
 * The webhook signature / parse / field-mapping logic is byte-equivalent
 * to `worker/src/pm-sync/adapters/linear/linear-adapter.ts`. Keep both
 * copies in sync.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.1
 */

import 'server-only'
import type {
  HumanWorkItemLite,
  PmAdapter,
  PmAdapterContext,
  PmIssuePatch,
  PmIssueRef,
  PmResolution,
  PmWebhookEvent,
  PmWebhookEventType,
} from '@contracts/pm-adapter'
import { hmacSha256, timingSafeEqual } from '../../webhook-verify'
import { PmSyncAuthError, PmSyncError, PmSyncMappingError } from '../../errors'
import { nangoProxyFetch } from '@/lib/oauth/nango-fetch'

// ─── Field maps (Linear-specific) ──────────────────────────────────────────

const LINEAR_PRIORITY_TO_LUCID: Record<number, HumanWorkItemLite['priority']> = {
  0: 'normal',
  1: 'critical',
  2: 'high',
  3: 'normal',
  4: 'low',
}

const LUCID_PRIORITY_TO_LINEAR: Record<HumanWorkItemLite['priority'], number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
}

const LUCID_MARKER_PREFIX = '<!-- lucid-work-item:'
const LUCID_MARKER_REGEX = /<!--\s*lucid-work-item:\s*([0-9a-f-]{36})\s*-->/i

function buildLinearDescription(wi: HumanWorkItemLite): string {
  const marker = `${LUCID_MARKER_PREFIX} ${wi.id} -->`
  const body = (wi.description ?? '').trim()
  const placeholder = body.length > 0 ? body : '_No description provided._'
  const lines: string[] = [marker, '', placeholder]
  if (wi.dagContext) {
    lines.push(
      '',
      '---',
      '',
      '**Lucid DAG Context**',
      '',
      `- DAG: \`${wi.dagContext.dagId}\``,
      `- Node: \`${wi.dagContext.dagNodeId}\``,
      `- Downstream blocked: **${wi.dagContext.downstreamBlockedCount}** node(s)`,
    )
  }
  return lines.join('\n')
}

// ─── GraphQL client (via control-plane Nango proxy) ───────────────────────

interface LinearGraphQlResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>
}

async function linearGraphql<T>(
  ctx: PmAdapterContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof nangoProxyFetch>>
  try {
    response = await nangoProxyFetch<LinearGraphQlResponse<T>>('graphql', {
      connectionId: ctx.nangoConnectionId,
      providerConfigKey: ctx.providerConfigKey,
      method: 'POST',
      body: { query, variables },
      label: 'linear-graphql',
    })
  } catch (err) {
    throw new PmSyncError(
      `Linear GraphQL request failed: ${(err as Error).message}`,
      { provider: 'linear', retryable: true, cause: err },
    )
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PmSyncAuthError('Linear auth rejected', { provider: 'linear' })
    }
    throw new PmSyncError(`Linear GraphQL HTTP ${response.status}`, {
      provider: 'linear',
      retryable: response.status >= 500 || response.status === 429,
    })
  }
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
      description: buildLinearDescription(wi),
      priority: LUCID_PRIORITY_TO_LINEAR[wi.priority] ?? 3,
    }
    if (wi.labels.length > 0) {
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
      input.dueDate = wi.dueAt.slice(0, 10)
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

    if (p.type !== 'Issue') return null

    const action = p.action as string | undefined
    const data = p.data as Record<string, unknown> | undefined
    if (!data || typeof data.id !== 'string') return null

    let type: PmWebhookEventType = 'unknown'
    if (action === 'create') type = 'issue.created'
    else if (action === 'update') {
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

    const description = (data.description as string | undefined) ?? ''
    const hasMarker = LUCID_MARKER_REGEX.test(description)

    const patch: PmIssuePatch = {}
    if (typeof data.title === 'string') patch.title = data.title
    if (typeof data.description === 'string') patch.description = data.description
    if (typeof data.priority === 'number') {
      patch.priority = LINEAR_PRIORITY_TO_LUCID[data.priority] ?? 'normal'
    }
    if (typeof data.dueDate === 'string') patch.dueAt = data.dueDate

    const actor = p.actor as { id?: string } | undefined
    const createdAt = p.createdAt as string | undefined

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
      isEcho: hasMarker && type === 'issue.updated',
      actorId: actor?.id,
      patch: Object.keys(patch).length > 0 ? patch : undefined,
      resolution,
      occurredAt: createdAt,
    }
  },
}
