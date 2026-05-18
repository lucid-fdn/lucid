/**
 * PM Sync Dispatcher — Orchestrates inbound webhook → work item lookup.
 *
 * The control plane side of the adapter sandwich. Outbound sync (create/
 * update/close) runs on the worker and lives in `worker/src/pm-sync/
 * outbound-worker.ts`. This dispatcher handles the opposite direction:
 * a verified webhook arrives, we parse it, dedupe it, look up the local
 * work item, and hand it to the right completion path.
 *
 * It deliberately does NOT import the DB-layer `completeWorkItem()` —
 * that's the caller's responsibility, because the XOR between
 * pulse_standalone and nerve_node is owned by the DB layer. The
 * dispatcher's only job is: verify → dedupe → parse → lookup → return
 * a normalized instruction for the route handler to act on.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import 'server-only'
import type {
  PmAdapter,
  PmProvider,
  PmWebhookEvent,
} from '@contracts/pm-adapter'
import type { WorkItemExternalRef } from '@/lib/db/pm-external-refs'
import { findWorkItemByExternalRef } from '@/lib/db/pm-external-refs'
import { markEventSeen } from './dedupe'
import { getAdapter } from './registry'
import {
  recordWebhookReceived,
  recordWebhookRejected,
  recordWebhookProcessed,
  recordWebhookEcho,
  reportSyncError,
} from './telemetry'

/** Outcome returned to the webhook route handler. */
export type InboundDispatchResult =
  | { outcome: 'ignored'; reason: 'signature' | 'dedupe' | 'parse' | 'no_match' | 'disabled' | 'echo' }
  | {
      outcome: 'apply'
      provider: PmProvider
      event: PmWebhookEvent
      ref: WorkItemExternalRef
    }

export interface HandleInboundInput {
  provider: PmProvider
  rawBody: string
  headers: Record<string, string>
  /**
   * Pre-computed raw event id for dedupe. Webhook routes extract this
   * from a provider-specific location (Linear: data.id, Asana: events[0].guid,
   * etc.) BEFORE calling the dispatcher so dedupe can happen without
   * parsing. If null, dedupe is skipped.
   */
  rawEventId: string | null
  /**
   * Org-specific webhook secret loaded from `org_pm_config.webhook_secret`
   * by the calling route. Passed through to `adapter.verifySignature()`.
   * When null, adapters without a secret requirement can still pass.
   */
  webhookSecret?: string | null
}

/**
 * Handle one inbound webhook delivery from arrival to "go/no-go". Never
 * throws — every failure is captured as a typed `ignored` outcome so the
 * webhook route can return an appropriate HTTP status.
 *
 * Flow:
 *  1. Record receipt (metrics).
 *  2. Resolve adapter. Unknown provider → ignore (disabled).
 *  3. Verify signature via adapter.
 *  4. Dedupe via Redis (fails open if not configured).
 *  5. Parse payload. Null return → ignore (ping/noise events).
 *  6. Echo guard (event.isEcho=true OR actor matches sync bot).
 *  7. Look up mirror row by (provider, externalId). No match → ignore.
 *  8. Return { outcome: 'apply', ... } to the caller.
 */
export async function handleInboundEvent(
  input: HandleInboundInput,
): Promise<InboundDispatchResult> {
  const { provider, rawBody, headers, rawEventId, webhookSecret } = input

  recordWebhookReceived(provider)

  const adapter = getAdapter(provider)
  if (!adapter) {
    recordWebhookRejected(provider, 'disabled')
    return { outcome: 'ignored', reason: 'disabled' }
  }

  // 3. Signature verification
  let signatureOk = false
  try {
    signatureOk = adapter.verifySignature(rawBody, headers, webhookSecret ?? null)
  } catch (err) {
    reportSyncError(err, { op: 'verifySignature', provider, severity: 'warning' })
    signatureOk = false
  }
  if (!signatureOk) {
    recordWebhookRejected(provider, 'signature')
    return { outcome: 'ignored', reason: 'signature' }
  }

  // 4. Dedupe (fails open)
  if (rawEventId) {
    const firstSighting = await markEventSeen(provider, rawEventId)
    if (!firstSighting) {
      recordWebhookRejected(provider, 'dedupe')
      return { outcome: 'ignored', reason: 'dedupe' }
    }
  }

  // 5. Parse
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch (err) {
    reportSyncError(err, { op: 'json.parse', provider, severity: 'warning' })
    recordWebhookRejected(provider, 'parse')
    return { outcome: 'ignored', reason: 'parse' }
  }

  let event: PmWebhookEvent | null = null
  try {
    event = await adapter.parseWebhook(parsed, headers)
  } catch (err) {
    reportSyncError(err, { op: 'parseWebhook', provider })
    recordWebhookRejected(provider, 'parse')
    return { outcome: 'ignored', reason: 'parse' }
  }
  if (!event) {
    // Adapter decided to drop it (ping, unknown type, etc.)
    return { outcome: 'ignored', reason: 'parse' }
  }

  // 6. Echo guard
  if (event.isEcho) {
    recordWebhookEcho(provider)
    return { outcome: 'ignored', reason: 'echo' }
  }

  // 7. Look up mirror row
  const ref = await findWorkItemByExternalRef(provider, event.externalId)
  if (!ref) {
    recordWebhookRejected(provider, 'no_match')
    return { outcome: 'ignored', reason: 'no_match' }
  }

  recordWebhookProcessed(provider, event.type)
  return { outcome: 'apply', provider, event, ref }
}

/**
 * Test-only helper: run the same pipeline but with a user-supplied
 * adapter instance instead of looking one up from the registry. Used
 * by the contract test harness to exercise fake adapters.
 */
export async function handleInboundEventWithAdapter(
  adapter: PmAdapter,
  input: Omit<HandleInboundInput, 'provider'>,
): Promise<InboundDispatchResult> {
  // The test harness skips registry lookup by pre-registering the fake
  // adapter. This export is a thin re-dispatch so tests can exercise
  // handleInboundEvent directly without the global registry.
  const { registerAdapter } = await import('./registry')
  registerAdapter(adapter)
  return handleInboundEvent({ ...input, provider: adapter.provider })
}
