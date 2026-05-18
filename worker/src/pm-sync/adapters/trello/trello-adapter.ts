/**
 * Trello Adapter — Worker-side implementation.
 *
 * Implements the `PmAdapter` contract for Trello via its REST API proxied
 * through Nango. Handles:
 *   - Webhook signature verification (HMAC-SHA1 base64 over body+callbackURL)
 *   - Outbound create / update / close against Trello REST cards API
 *   - Reconcile fetchStatus reads for drift detection
 *
 * Trello uses lists-as-status convention:
 *   open         → default list (no move)
 *   in_progress  → configured "In Progress" list ID
 *   done         → card `closed: true` + move to done list
 *   rejected     → card `closed: true` (Trello has no rejected state)
 *
 * Rate limit: strict 100 req/10s per token — reconcile batch capped at 20.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.3
 */

import type {
  HumanWorkItemLite,
  PmAdapter,
  PmAdapterContext,
  PmResolution,
  PmWebhookEventType,
} from '../../types.js'
import { hmacSha1Base64, timingSafeEqual } from '../../webhook-verify.js'
import { PmSyncError, PmSyncMappingError } from '../../errors.js'
import { buildDescription } from '../../description-builder.js'
import { requireNangoClient, handleNangoError } from '../../nango-helpers.js'

// ─── Field maps (Trello-specific) ─────────────────────────────────────────

const LUCID_PRIORITY_TO_TRELLO_LABEL: Record<HumanWorkItemLite['priority'], string> = {
  critical: 'red',
  high: 'orange',
  normal: 'blue',
  low: 'green',
}


// ─── Trello REST client (via Nango proxy) ─────────────────────────────────

async function trelloRequest<T>(
  ctx: PmAdapterContext,
  method: 'GET' | 'POST' | 'PUT',
  endpoint: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const nango = requireNangoClient('trello')
  try {
    const opts = {
      connectionId: ctx.nangoConnectionId,
      providerConfigKey: ctx.providerConfigKey,
      endpoint,
      retries: 2, // Lower retries due to strict rate limits
    }
    let response: { data: unknown }
    if (method === 'GET') {
      response = await nango.get(opts)
    } else if (method === 'POST') {
      response = await nango.post({ ...opts, data })
    } else {
      response = await nango.put({ ...opts, data })
    }
    return response.data as T
  } catch (err) {
    handleNangoError(err, 'trello', 'Trello API request failed')
  }
}

// ─── The adapter ───────────────────────────────────────────────────────────

export const trelloAdapter: PmAdapter = {
  provider: 'trello',

  async createIssue(wi, ctx) {
    const listId = (ctx.providerConfig.listId ?? ctx.providerConfig.list_id) as string | undefined
    if (!listId) {
      throw new PmSyncMappingError(
        'Trello adapter requires `listId` in org_pm_config.config',
        { provider: 'trello' },
      )
    }

    const cardData: Record<string, unknown> = {
      name: wi.title,
      desc: buildDescription(wi, 'plaintext'),
      idList: listId,
      pos: 'bottom',
    }
    if (wi.dueAt) {
      cardData.due = wi.dueAt // Trello accepts ISO-8601
    }

    const card = await trelloRequest<{
      id: string
      shortUrl: string
    }>(ctx, 'POST', '/1/cards', cardData)

    // Apply priority label if configured (best-effort)
    const labelMap = ctx.providerConfig.priorityLabelMap as Record<string, string> | undefined
    if (labelMap) {
      const labelId = labelMap[LUCID_PRIORITY_TO_TRELLO_LABEL[wi.priority]]
      if (labelId) {
        try {
          await trelloRequest(ctx, 'POST', `/1/cards/${card.id}/idLabels`, {
            value: labelId,
          })
        } catch (err) {
          console.warn('[pm-sync:trello] Best-effort label failed:', (err as Error).message)
        }
      }
    }

    return {
      provider: 'trello',
      externalId: card.id,
      externalUrl: card.shortUrl,
      metadata: { listId },
    }
  },

  async updateIssue(ref, patch, ctx) {
    const data: Record<string, unknown> = {}
    if (patch.title !== undefined) data.name = patch.title
    if (patch.description !== undefined) data.desc = patch.description ?? ''
    if (patch.dueAt !== undefined) {
      data.due = patch.dueAt ?? null
    }
    if (Object.keys(data).length === 0) return

    await trelloRequest(ctx, 'PUT', `/1/cards/${ref.externalId}`, data)
  },

  async closeIssue(ref, _resolution, ctx) {
    // Close = archive the card. Optionally move to done list in the same call.
    const doneListId = ctx.providerConfig.doneListId as string | undefined
    const data: Record<string, unknown> = { closed: true }
    if (doneListId) data.idList = doneListId
    await trelloRequest(ctx, 'PUT', `/1/cards/${ref.externalId}`, data)
  },

  async fetchStatus(ref, ctx) {
    try {
      const card = await trelloRequest<{
        id: string
        closed: boolean
      }>(ctx, 'GET', `/1/cards/${ref.externalId}?fields=closed`)

      if (!card) return null
      return {
        externalStatus: card.closed ? 'archived' : 'active',
        closed: card.closed,
      }
    } catch (err) {
      if (err instanceof PmSyncError && !err.retryable) return null
      throw err
    }
  },

  verifySignature(rawBody, headers, secret) {
    if (!secret) return false
    const received = headers['x-trello-webhook']
    if (!received || typeof received !== 'string') return false
    // Trello signs body + callbackURL. The webhook dispatcher must inject the
    // configured callbackURL into headers['x-trello-callback-url'] before calling
    // verifySignature (Trello itself does NOT send this header).
    const callbackUrl = headers['x-trello-callback-url'] ?? ''
    const expected = hmacSha1Base64(secret, rawBody + callbackUrl)
    return timingSafeEqual(received, expected)
  },

  async parseWebhook(payload, _headers) {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as { action?: Record<string, unknown> }
    if (!p.action) return null

    const action = p.action
    const actionType = action.type as string | undefined
    const cardData = (action.data as Record<string, unknown> | undefined)?.card as
      | Record<string, string>
      | undefined
    if (!cardData?.id) return null

    let type: PmWebhookEventType = 'unknown'
    if (actionType === 'createCard') {
      type = 'issue.created'
    } else if (actionType === 'updateCard') {
      const old = (action.data as Record<string, unknown> | undefined)?.old as
        | Record<string, unknown>
        | undefined
      if (old && 'closed' in old) {
        const card = (action.data as Record<string, unknown>)?.card as Record<string, unknown> | undefined
        type = card?.closed === true ? 'issue.closed' : 'issue.reopened'
      } else {
        type = 'issue.updated'
      }
    } else if (actionType === 'deleteCard') {
      type = 'issue.closed'
    }

    const memberCreator = action.memberCreator as Record<string, string> | undefined

    return {
      provider: 'trello' as const,
      type,
      externalId: cardData.id,
      isEcho: false,
      actorId: memberCreator?.id,
      resolution: type === 'issue.closed' ? ('completed' as PmResolution) : undefined,
      occurredAt: action.date as string | undefined,
    }
  },
}
