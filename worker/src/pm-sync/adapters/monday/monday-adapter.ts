/**
 * Monday.com Adapter — Worker-side implementation.
 *
 * Implements the `PmAdapter` contract for Monday.com via its GraphQL API v2
 * proxied through Nango. Handles:
 *   - Webhook signature verification (shared secret comparison on `authorization` header)
 *   - Challenge-response handshake (`{ challenge }` → echo back)
 *   - Outbound create / update / close against Monday GraphQL mutations
 *   - Reconcile fetchStatus reads for drift detection
 *
 * Monday uses status columns for state:
 *   open         → default status label (or configured "Working on it")
 *   in_progress  → configured "In Progress" label
 *   done         → configured "Done" label
 *   rejected     → configured "Stuck" or "Done" label (no native rejected)
 *
 * Complexity budget: 10M/day, 5M/min. Simple queries cost 1-10, mutations 10-50.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.4
 */

import type {
  HumanWorkItemLite,
  PmAdapter,
  PmAdapterContext,
  PmResolution,
  PmWebhookEventType,
} from '../../types.js'
import { timingSafeEqual } from '../../webhook-verify.js'
import { PmSyncError, PmSyncMappingError } from '../../errors.js'
import { buildDescription } from '../../description-builder.js'
import { requireNangoClient, handleNangoError } from '../../nango-helpers.js'

// ─── Field maps (Monday-specific) ─────────────────────────────────────────

const LUCID_STATUS_TO_MONDAY_DEFAULT: Record<string, string> = {
  open: 'Working on it',
  in_progress: 'Working on it',
  done: 'Done',
  cancelled: 'Done',
  rejected: 'Stuck',
  waiting: 'Stuck',
}


// ─── Monday GraphQL client (via Nango proxy) ──────────────────────────────

interface MondayGraphQlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
  error_message?: string
}

async function mondayGraphql<T>(
  ctx: PmAdapterContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const nango = requireNangoClient('monday')
  try {
    const response = await nango.post({
      connectionId: ctx.nangoConnectionId,
      providerConfigKey: ctx.providerConfigKey,
      endpoint: '/v2',
      data: { query, variables: variables ?? {} },
      headers: { 'Content-Type': 'application/json' },
      retries: 3,
    })
    const body = response.data as MondayGraphQlResponse<T>
    if (body.error_message) {
      throw new PmSyncError(
        `Monday API error: ${body.error_message}`,
        { provider: 'monday', retryable: false, cause: body },
      )
    }
    if (body.errors && body.errors.length > 0) {
      const msg = body.errors.map((e) => e.message).join('; ')
      const isComplexity = msg.toLowerCase().includes('complexity')
      throw new PmSyncError(`Monday GraphQL error: ${msg}`, {
        provider: 'monday',
        retryable: isComplexity,
        cause: body.errors,
      })
    }
    if (!body.data) {
      throw new PmSyncError('Monday GraphQL returned no data', {
        provider: 'monday',
        retryable: false,
      })
    }
    return body.data
  } catch (err) {
    handleNangoError(err, 'monday', 'Monday API request failed')
  }
}

// ─── GraphQL operations ───────────────────────────────────────────────────

const CREATE_ITEM_MUTATION = `
  mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON) {
    create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
      id
    }
  }
`

const CHANGE_COLUMN_MUTATION = `
  mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
      id
    }
  }
`

const FETCH_ITEM_QUERY = `
  query ($ids: [ID!]!) {
    items(ids: $ids) {
      id
      state
      column_values {
        id
        text
        type
      }
    }
  }
`

// ─── The adapter ───────────────────────────────────────────────────────────

export const mondayAdapter: PmAdapter = {
  provider: 'monday',

  async createIssue(wi, ctx) {
    const boardId = (ctx.providerConfig.boardId ?? ctx.providerConfig.board_id) as string | undefined
    if (!boardId) {
      throw new PmSyncMappingError(
        'Monday adapter requires `boardId` in org_pm_config.config',
        { provider: 'monday' },
      )
    }

    // Build column values JSON
    const columnValues: Record<string, unknown> = {}

    // Status column
    const statusColumnId = (ctx.providerConfig.statusColumnId ?? 'status') as string
    const statusLabels = ctx.providerConfig.statusLabels as Record<string, string> | undefined
    const statusLabel = statusLabels?.[wi.status] ?? LUCID_STATUS_TO_MONDAY_DEFAULT[wi.status] ?? 'Working on it'
    columnValues[statusColumnId] = { label: statusLabel }

    // Date column
    if (wi.dueAt) {
      const dateColumnId = (ctx.providerConfig.dateColumnId ?? 'date') as string
      columnValues[dateColumnId] = { date: wi.dueAt.slice(0, 10) }
    }

    // Priority column (if configured)
    const priorityColumnId = ctx.providerConfig.priorityColumnId as string | undefined
    if (priorityColumnId) {
      const priorityLabels = ctx.providerConfig.priorityLabels as Record<string, string> | undefined
      const priorityLabel = priorityLabels?.[wi.priority] ?? wi.priority
      columnValues[priorityColumnId] = { label: priorityLabel }
    }

    // Notes/text column for description
    const textColumnId = ctx.providerConfig.textColumnId as string | undefined
    if (textColumnId) {
      columnValues[textColumnId] = buildDescription(wi, 'plaintext')
    }

    const data = await mondayGraphql<{
      create_item: { id: string }
    }>(ctx, CREATE_ITEM_MUTATION, {
      boardId,
      itemName: wi.title,
      columnValues: JSON.stringify(columnValues),
    })

    const itemId = data.create_item.id
    return {
      provider: 'monday',
      externalId: itemId,
      externalUrl: `https://monday.com/boards/${boardId}/pulses/${itemId}`,
      metadata: { boardId },
    }
  },

  async updateIssue(ref, patch, ctx) {
    const boardId = (ref.metadata?.boardId ?? ctx.providerConfig.boardId ?? ctx.providerConfig.board_id) as
      | string
      | undefined
    if (!boardId) {
      throw new PmSyncMappingError(
        'Monday adapter requires `boardId` in ref.metadata or org_pm_config.config',
        { provider: 'monday' },
      )
    }

    // Update item name if title changed
    if (patch.title !== undefined) {
      await mondayGraphql(ctx, CHANGE_COLUMN_MUTATION, {
        boardId,
        itemId: ref.externalId,
        columnId: 'name',
        value: JSON.stringify(patch.title),
      })
    }

    // Update date column
    if (patch.dueAt !== undefined) {
      const dateColumnId = (ctx.providerConfig.dateColumnId ?? 'date') as string
      await mondayGraphql(ctx, CHANGE_COLUMN_MUTATION, {
        boardId,
        itemId: ref.externalId,
        columnId: dateColumnId,
        value: patch.dueAt ? JSON.stringify({ date: patch.dueAt.slice(0, 10) }) : JSON.stringify({}),
      })
    }

    // Update text column for description
    if (patch.description !== undefined) {
      const textColumnId = ctx.providerConfig.textColumnId as string | undefined
      if (textColumnId) {
        await mondayGraphql(ctx, CHANGE_COLUMN_MUTATION, {
          boardId,
          itemId: ref.externalId,
          columnId: textColumnId,
          value: JSON.stringify(patch.description ?? ''),
        })
      }
    }
  },

  async closeIssue(ref, resolution, ctx) {
    const boardId = (ref.metadata?.boardId ?? ctx.providerConfig.boardId ?? ctx.providerConfig.board_id) as
      | string
      | undefined
    if (!boardId) {
      throw new PmSyncMappingError(
        'Monday adapter requires `boardId` in ref.metadata or org_pm_config.config',
        { provider: 'monday' },
      )
    }

    const statusColumnId = (ctx.providerConfig.statusColumnId ?? 'status') as string
    const statusLabels = ctx.providerConfig.statusLabels as Record<string, string> | undefined

    const isCancel =
      resolution === 'cancelled' ||
      resolution === 'rejected' ||
      (typeof resolution === 'object' && resolution.custom === 'cancelled')

    const label = isCancel
      ? (statusLabels?.cancelled ?? statusLabels?.rejected ?? 'Done')
      : (statusLabels?.done ?? 'Done')

    await mondayGraphql(ctx, CHANGE_COLUMN_MUTATION, {
      boardId,
      itemId: ref.externalId,
      columnId: statusColumnId,
      value: JSON.stringify({ label }),
    })
  },

  async fetchStatus(ref, ctx) {
    try {
      const numericId = Number(ref.externalId)
      if (!Number.isFinite(numericId)) return null

      const data = await mondayGraphql<{
        items: Array<{
          id: string
          state: string
          column_values: Array<{ id: string; text: string; type: string }>
        }>
      }>(ctx, FETCH_ITEM_QUERY, { ids: [numericId] })

      if (!data.items || data.items.length === 0) return null
      const item = data.items[0]

      // Check if item is archived or deleted
      if (item.state === 'deleted') return null
      if (item.state === 'archived') {
        return { externalStatus: 'archived', closed: true }
      }

      // Check status column
      const statusColumnId = (ctx.providerConfig.statusColumnId ?? 'status') as string
      const statusCol = item.column_values.find((c) => c.id === statusColumnId)
      const statusText = statusCol?.text ?? ''

      // Check if status matches any "done" labels
      const doneLabels = (ctx.providerConfig.doneLabels as string[] | undefined) ?? ['Done']
      const closed = doneLabels.some((l) => l.toLowerCase() === statusText.toLowerCase())

      return {
        externalStatus: statusText || 'active',
        closed,
      }
    } catch (err) {
      if (err instanceof PmSyncError && !err.retryable) return null
      throw err
    }
  },

  verifySignature(_rawBody, headers, secret) {
    if (!secret) return false
    // Monday sends the webhook signing secret in the `authorization` header
    const received = headers['authorization']
    if (!received || typeof received !== 'string') return false
    return timingSafeEqual(received, secret)
  },

  async parseWebhook(payload, _headers) {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>

    // Challenge-response handshake
    if (p.challenge) return null

    const event = p.event as Record<string, unknown> | undefined
    if (!event) return null

    const eventType = event.type as string | undefined
    const itemId = String(event.pulseId ?? event.itemId ?? '')
    if (!itemId) return null

    let type: PmWebhookEventType = 'unknown'
    if (eventType === 'create_pulse' || eventType === 'create_item') {
      type = 'issue.created'
    } else if (eventType === 'update_column_value' || eventType === 'change_column_value') {
      // Check if it's a status column change
      const columnId = event.columnId as string | undefined
      const columnType = event.columnType as string | undefined
      if (columnType === 'color' || columnId === 'status') {
        const value = event.value as Record<string, unknown> | undefined
        const label = (value?.label as Record<string, unknown>)?.text as string | undefined
        const doneLabels = ['done', 'complete', 'completed']
        if (label && doneLabels.includes(label.toLowerCase())) {
          type = 'issue.closed'
        } else {
          type = 'issue.updated'
        }
      } else {
        type = 'issue.updated'
      }
    } else if (eventType === 'delete_pulse' || eventType === 'archive_pulse') {
      type = 'issue.closed'
    } else if (eventType === 'update_name') {
      type = 'issue.updated'
    }

    const userId = String(event.userId ?? '')

    return {
      provider: 'monday' as const,
      type,
      externalId: itemId,
      isEcho: false,
      actorId: userId || undefined,
      resolution: type === 'issue.closed' ? ('completed' as PmResolution) : undefined,
      occurredAt: event.triggerTime as string | undefined,
    }
  },
}
