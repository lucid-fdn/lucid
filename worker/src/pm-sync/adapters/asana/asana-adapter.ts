/**
 * Asana Adapter — Worker-side implementation.
 *
 * Implements the `PmAdapter` contract for Asana via its REST API proxied
 * through Nango. Handles:
 *   - Webhook signature verification (HMAC-SHA256 base64 in `x-hook-signature`)
 *   - Webhook handshake detection (X-Hook-Secret → echo for subscription)
 *   - Outbound create / update / close against Asana REST tasks API
 *   - Reconcile fetchStatus reads for drift detection
 *
 * Asana uses sections-as-status convention:
 *   open         → default section (no move)
 *   in_progress  → configured "In Progress" section GID
 *   done         → task `completed: true`
 *   rejected     → task `completed: true` (Asana has no rejected state)
 *
 * Rate limit: 1500 req/min/token (generous, Nango handles retry).
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section C.2
 */

import type {
  HumanWorkItemLite,
  PmAdapter,
  PmAdapterContext,
  PmResolution,
  PmWebhookEventType,
} from '../../types.js'
import { hmacSha256Base64, timingSafeEqual } from '../../webhook-verify.js'
import { PmSyncError, PmSyncMappingError } from '../../errors.js'
import { buildDescription } from '../../description-builder.js'
import { requireNangoClient, handleNangoError } from '../../nango-helpers.js'

// ─── Field maps (Asana-specific) ──────────────────────────────────────────

const LUCID_PRIORITY_TO_ASANA: Record<HumanWorkItemLite['priority'], string> = {
  critical: 'high',
  high: 'high',
  normal: 'medium',
  low: 'low',
}


// ─── Asana REST client (via Nango proxy) ──────────────────────────────────

async function asanaRequest<T>(
  ctx: PmAdapterContext,
  method: 'GET' | 'POST' | 'PUT',
  endpoint: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const nango = requireNangoClient('asana')
  try {
    const opts = {
      connectionId: ctx.nangoConnectionId,
      providerConfigKey: ctx.providerConfigKey,
      endpoint,
      retries: 3,
    }
    let response: { data: unknown }
    if (method === 'GET') {
      response = await nango.get(opts)
    } else if (method === 'POST') {
      response = await nango.post({ ...opts, data: data ? { data } : undefined })
    } else {
      response = await nango.put({ ...opts, data: data ? { data } : undefined })
    }
    const body = response.data as { data?: T; errors?: Array<{ message: string }> }
    if (body.errors && body.errors.length > 0) {
      throw new PmSyncError(
        `Asana API error: ${body.errors.map((e) => e.message).join('; ')}`,
        { provider: 'asana', retryable: false, cause: body.errors },
      )
    }
    return body.data as T
  } catch (err) {
    handleNangoError(err, 'asana', 'Asana API request failed')
  }
}

// ─── The adapter ───────────────────────────────────────────────────────────

export const asanaAdapter: PmAdapter = {
  provider: 'asana',

  async createIssue(wi, ctx) {
    const projectGid = (ctx.providerConfig.projectGid ?? ctx.providerConfig.project_gid) as
      | string
      | undefined
    if (!projectGid) {
      throw new PmSyncMappingError(
        'Asana adapter requires `projectGid` in org_pm_config.config',
        { provider: 'asana' },
      )
    }

    const taskData: Record<string, unknown> = {
      name: wi.title,
      notes: buildDescription(wi, 'plaintext'),
      projects: [projectGid],
    }
    if (wi.dueAt) {
      taskData.due_on = wi.dueAt.slice(0, 10) // YYYY-MM-DD
    }
    // Asana doesn't have native priority — could use custom field if configured
    const customPriorityFieldGid = ctx.providerConfig.priorityFieldGid as string | undefined
    if (customPriorityFieldGid) {
      taskData.custom_fields = {
        [customPriorityFieldGid]: LUCID_PRIORITY_TO_ASANA[wi.priority],
      }
    }

    const task = await asanaRequest<{
      gid: string
      permalink_url: string
    }>(ctx, 'POST', '/tasks', taskData)

    // Move to configured section if in_progress
    const sectionGid = ctx.providerConfig.inProgressSectionGid as string | undefined
    if (sectionGid && wi.status === 'in_progress') {
      try {
        await asanaRequest(ctx, 'POST', `/sections/${sectionGid}/addTask`, {
          task: task.gid,
        })
      } catch (err) {
        console.warn('[pm-sync:asana] Best-effort section move failed:', (err as Error).message)
      }
    }

    return {
      provider: 'asana',
      externalId: task.gid,
      externalUrl: task.permalink_url,
      metadata: { projectGid },
    }
  },

  async updateIssue(ref, patch, ctx) {
    const data: Record<string, unknown> = {}
    if (patch.title !== undefined) data.name = patch.title
    if (patch.description !== undefined) data.notes = patch.description ?? ''
    if (patch.dueAt !== undefined) {
      data.due_on = patch.dueAt ? patch.dueAt.slice(0, 10) : null
    }
    if (Object.keys(data).length === 0) return

    await asanaRequest(ctx, 'PUT', `/tasks/${ref.externalId}`, data)
  },

  async closeIssue(ref, _resolution, ctx) {
    // Close = mark task as completed. Asana doesn't distinguish done vs rejected.
    await asanaRequest(ctx, 'PUT', `/tasks/${ref.externalId}`, {
      completed: true,
    })
  },

  async fetchStatus(ref, ctx) {
    try {
      const task = await asanaRequest<{
        gid: string
        completed: boolean
        completed_at: string | null
      }>(ctx, 'GET', `/tasks/${ref.externalId}?opt_fields=completed,completed_at`)

      if (!task) return null
      return {
        externalStatus: task.completed ? 'completed' : 'active',
        closed: task.completed,
      }
    } catch (err) {
      if (err instanceof PmSyncError && !err.retryable) return null
      throw err
    }
  },

  verifySignature(rawBody, headers, secret) {
    if (!secret) return false
    const received = headers['x-hook-signature']
    if (!received || typeof received !== 'string') return false
    const expected = hmacSha256Base64(secret, rawBody)
    return timingSafeEqual(received, expected)
  },

  async parseWebhook(payload, _headers) {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as { events?: unknown[] }
    if (!Array.isArray(p.events) || p.events.length === 0) return null

    // Process first relevant event (Asana sends arrays)
    for (const evt of p.events) {
      const e = evt as Record<string, unknown>
      if (e.resource_type !== 'task') continue

      const action = e.action as string
      const resourceGid = (e.resource as Record<string, string> | undefined)?.gid
      if (!resourceGid) continue

      let type: PmWebhookEventType = 'unknown'
      if (action === 'added') type = 'issue.created'
      else if (action === 'changed') {
        // Check if it's a completion toggle via change field
        const change = e.change as { field?: string; new_value?: unknown } | undefined
        if (change?.field === 'completed') {
          type = change.new_value ? 'issue.closed' : 'issue.reopened'
        } else {
          type = 'issue.updated'
        }
      } else if (action === 'removed') {
        type = 'issue.closed'
      }

      return {
        provider: 'asana' as const,
        type,
        externalId: resourceGid,
        isEcho: false,
        actorId: (e.user as Record<string, string> | undefined)?.gid,
        resolution: type === 'issue.closed' ? ('completed' as PmResolution) : undefined,
        occurredAt: e.created_at as string | undefined,
      }
    }
    return null
  },
}
