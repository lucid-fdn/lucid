/**
 * POST /api/webhooks/pm/[provider]/[orgId]
 *
 * Inbound webhook receiver for external PM providers (Linear, Asana,
 * Trello, Monday). The route loads the org's config + webhook secret,
 * extracts the provider-specific raw event id for dedupe, then hands
 * the payload to the shared dispatcher. All ignore reasons return HTTP
 * 200 so providers do not retry — signature failures are logged but
 * also ACK'd (otherwise attackers could DoS the queue by triggering
 * retry storms).
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { PM_PROVIDERS, type PmProvider } from '@contracts/pm-adapter'
import { handleInboundEvent } from '@/lib/pm-sync'
import { getOrgPmConfig } from '@/lib/db/pm-config'
import { completeWorkItem, patchWorkItem, reopenWorkItem } from '@/lib/db/human-work-items'
import { ErrorService } from '@/lib/errors/error-service'
import { supabase } from '@/lib/db/client'
import { isFeatureEnabled } from '@/lib/features'
import { projectInboundPmEventToWorkGraph, type WorkGraphPmInboundDecision } from '@/lib/work-graph/pm-federation'

export const dynamic = 'force-dynamic'

/** Sentinel user id used when external sync closes a work item. */
const SYSTEM_SYNC_USER_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Extract the provider-specific raw event id from a parsed JSON payload.
 * Used for Redis dedupe BEFORE the adapter parses the webhook. If the
 * shape is unexpected, returns null and dedupe is skipped (fail-open).
 */
function extractRawEventId(
  provider: PmProvider,
  parsed: unknown,
  headers: Record<string, string>,
): string | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  switch (provider) {
    case 'linear': {
      const data = obj.data as Record<string, unknown> | undefined
      const id = data?.id
      return typeof id === 'string' ? id : null
    }
    case 'asana': {
      const events = obj.events as Array<Record<string, unknown>> | undefined
      const first = events?.[0]
      const guid = first?.guid
      return typeof guid === 'string' ? guid : null
    }
    case 'trello': {
      const action = obj.action as Record<string, unknown> | undefined
      const id = action?.id
      return typeof id === 'string' ? id : null
    }
    case 'monday': {
      // Monday uses a delivery id header on real events; challenges lack it.
      return headers['x-monday-delivery-id'] ?? null
    }
    default:
      return null
  }
}

function isValidProvider(p: string): p is PmProvider {
  return (PM_PROVIDERS as readonly string[]).includes(p)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; orgId: string }> },
) {
  const { provider, orgId } = await params

  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  }

  // Read raw body once — required for HMAC verification AND re-parse.
  const rawBody = await req.text()

  // Flatten headers to a lowercase Record<string, string>.
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  // Load org config (with secret) — trusted server path.
  const config = await getOrgPmConfig(orgId, provider, { includeSecret: true })
  if (!config || !config.enabled) {
    // ACK to avoid provider retries, but log for operator visibility.
    return NextResponse.json(
      { ok: true, outcome: 'ignored', reason: 'disabled' },
      { status: 200 },
    )
  }

  // Extract raw event id for dedupe. Best-effort JSON parse — if it
  // fails, dedupe is skipped (the dispatcher's parse step will catch it).
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    parsed = null
  }

  // ─── Linear Agent Session events (gated behind FEATURE_LINEAR_AGENT) ──
  // These bypass the standard dispatcher because they don't have a
  // work_item_external_refs row. Signature verification still happens
  // via the adapter, but the session event is handled separately.
  if (
    provider === 'linear' &&
    isFeatureEnabled('linearAgent') &&
    parsed &&
    typeof parsed === 'object' &&
    (parsed as Record<string, unknown>).type === 'AgentSession'
  ) {
    // Verify signature first
    const { getAdapter } = await import('@/lib/pm-sync/registry')
    const adapter = getAdapter(provider)
    if (adapter && !adapter.verifySignature(rawBody, headers, config.webhookSecret ?? null)) {
      return NextResponse.json(
        { ok: true, outcome: 'ignored', reason: 'signature' },
        { status: 200 },
      )
    }

    // Parse the agent session event via the adapter
    let event
    try {
      event = adapter ? await adapter.parseWebhook(parsed, headers) : null
    } catch {
      event = null
    }

    if (
      event &&
      (event.type === 'agent.session_created' ||
        event.type === 'agent.session_prompted' ||
        event.type === 'agent.session_signal')
    ) {
      // Agent session events are acknowledged immediately. The actual
      // session handling (thought emission, run enqueue) happens on the
      // worker side via the LinearAgentHandler. Phase 2 will wire the
      // Pulse enqueue path from here.
      return NextResponse.json(
        {
          ok: true,
          outcome: 'applied',
          action: 'agent_session_received',
          eventType: event.type,
          sessionId: event.agentSessionPayload?.sessionId,
        },
        { status: 200 },
      )
    }

    // If parsing failed or returned a non-agent event, fall through
    // to the standard dispatcher.
  }

  const rawEventId = extractRawEventId(provider, parsed, headers)

  try {
    const result = await handleInboundEvent({
      provider,
      rawBody,
      headers,
      rawEventId,
      webhookSecret: config.webhookSecret ?? null,
    })

    if (result.outcome === 'ignored') {
      return NextResponse.json(
        { ok: true, outcome: 'ignored', reason: result.reason },
        { status: 200 },
      )
    }

    let workGraphDecision: WorkGraphPmInboundDecision = {
      applyPatch: true,
      conflictState: 'clean',
      mode: 'mirror_only',
      fields: [],
      needsReview: false,
      reason: 'work_graph_projection_unavailable',
    }
    try {
      workGraphDecision = await projectInboundPmEventToWorkGraph({
        orgId,
        config,
        event: result.event,
        ref: result.ref,
      })
    } catch (projectionError) {
      ErrorService.captureException(projectionError as Error, {
        severity: 'warning',
        context: {
          endpoint: '/api/webhooks/pm/[provider]/[orgId]',
          provider,
          orgId,
          operation: 'projectInboundPmEventToWorkGraph',
        },
        tags: { layer: 'api', route: 'pm-webhook' },
      })
    }

    // apply branch — close, patch (issue.updated), and reopen events.
    if (result.event.type === 'issue.closed') {
      const resolution = resolveCloseOutcome(result.event.resolution)
      const outcome = await completeWorkItem({
        id: result.ref.work_item_id,
        userId: SYSTEM_SYNC_USER_ID,
        resolution,
        resolutionNotes: `Closed via ${provider} webhook`,
      })
      if (!outcome) {
        return NextResponse.json(
          { ok: true, outcome: 'ignored', reason: 'apply_failed' },
          { status: 200 },
        )
      }

      // Phase 6: if completing a nerve_node promoted children, notify the
      // worker scheduler via Supabase Broadcast so it picks up the newly
      // ready nodes without waiting for the safety-net sweep.
      if (outcome.promotedNodeIds.length > 0 && outcome.workItem.dag_id) {
        const ch = supabase.channel('dag:advance:webhook')
        ch.send({
          type: 'broadcast',
          event: 'nodes_promoted',
          payload: {
            dag_id: outcome.workItem.dag_id,
            node_ids: outcome.promotedNodeIds,
          },
        })
          .then(() => supabase.removeChannel(ch))
          .catch(() => supabase.removeChannel(ch))
      }

      return NextResponse.json(
        { ok: true, outcome: 'applied', action: 'closed' },
        { status: 200 },
      )
    }

    // Phase 6: apply field patches from external tool updates.
    if (result.event.type === 'issue.updated' && result.event.patch) {
      if (!workGraphDecision.applyPatch) {
        return NextResponse.json(
          {
            ok: true,
            outcome: 'applied',
            action: 'work_graph_review_required',
            conflict_state: workGraphDecision.conflictState,
          },
          { status: 200 },
        )
      }
      const patch = mapEventPatch(result.event.patch as Record<string, unknown>)
      if (patch) {
        const patched = await patchWorkItem({
          id: result.ref.work_item_id,
          patch,
          actorProvider: provider,
        })
        return NextResponse.json(
          { ok: true, outcome: patched ? 'applied' : 'ignored', action: patched ? 'patched' : 'noop' },
          { status: 200 },
        )
      }
    }

    // Phase 6: reopen a closed work item when the external issue is reopened.
    if (result.event.type === 'issue.reopened') {
      const reopened = await reopenWorkItem(result.ref.work_item_id, provider)
      return NextResponse.json(
        { ok: true, outcome: reopened ? 'applied' : 'ignored', action: reopened ? 'reopened' : 'noop' },
        { status: 200 },
      )
    }

    return NextResponse.json(
      { ok: true, outcome: 'applied', action: 'noop' },
      { status: 200 },
    )
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/webhooks/pm/[provider]/[orgId]',
        provider,
        orgId,
      },
      tags: { layer: 'api', route: 'pm-webhook' },
    })
    // Return 200 to prevent provider retry storms on persistent server
    // errors — operators see the error via Sentry + the reconcile cron
    // will re-sync state from the provider on its next tick.
    return NextResponse.json(
      { ok: true, outcome: 'ignored', reason: 'server_error' },
      { status: 200 },
    )
  }
}

/**
 * Map a PmIssuePatch from the webhook event to the patchWorkItem input shape.
 * Returns null if the patch has no applicable fields.
 */
function mapEventPatch(
  patch: Record<string, unknown>,
): { title?: string; description?: string | null; priority?: 'critical' | 'high' | 'normal' | 'low'; labels?: string[]; due_at?: string | null } | null {
  const out: Record<string, unknown> = {}
  if (typeof patch.title === 'string') out.title = patch.title
  if (patch.description === null || typeof patch.description === 'string') out.description = patch.description
  if (typeof patch.priority === 'string' && ['critical', 'high', 'normal', 'low'].includes(patch.priority)) {
    out.priority = patch.priority
  }
  if (Array.isArray(patch.labels)) {
    out.labels = patch.labels.filter((l: unknown): l is string => typeof l === 'string')
  }
  if (patch.dueAt !== undefined) out.due_at = (patch.dueAt as string | null) ?? null
  return Object.keys(out).length > 0 ? out : null
}

function resolveCloseOutcome(
  resolution: unknown,
): 'approved' | 'rejected' | 'completed' {
  if (resolution === 'rejected') return 'rejected'
  if (resolution === 'approved') return 'approved'
  return 'completed'
}
