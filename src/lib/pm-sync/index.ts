/**
 * PM Sync — Barrel export for the control-plane side of the adapter sandwich.
 *
 * Import sites:
 *   - Webhook routes (src/app/api/webhooks/pm/[provider]/route.ts)
 *   - Org config API (src/app/api/orgs/[id]/pm-config/)
 *   - Reconcile cron reads
 *
 * The worker side mirrors these helpers under `worker/src/pm-sync/`
 * because the worker cannot import from `src/`.
 */

export {
  PmSyncError,
  PmSyncMappingError,
  PmSyncAuthError,
  PmSyncRateLimitError,
} from './errors'

export {
  hmacSha256,
  hmacSha256Base64,
  hmacSha1Base64,
  timingSafeEqual,
  parseSigHeader,
} from './webhook-verify'

export { markEventSeen, hasSeenEvent } from './dedupe'

export {
  buildStatusMap,
  buildPriorityMap,
  isTerminalStatus,
  WORK_ITEM_STATUSES,
  WORK_ITEM_PRIORITIES,
} from './field-mapping'

export {
  buildDescription,
  extractWorkItemIdFromBody,
  LUCID_WORK_ITEM_MARKER_PREFIX,
  LUCID_WORK_ITEM_MARKER_REGEX,
} from './description-builder'

export {
  snapshotCounters,
  recordWebhookReceived,
  recordWebhookRejected,
  recordWebhookProcessed,
  recordWebhookEcho,
  recordOutboundEnqueued,
  reportSyncError,
} from './telemetry'

export {
  registerAdapter,
  getAdapter,
  listRegisteredProviders,
  __resetRegistryForTests,
} from './registry'

export {
  handleInboundEvent,
  handleInboundEventWithAdapter,
} from './dispatcher'
export type {
  InboundDispatchResult,
  HandleInboundInput,
} from './dispatcher'
