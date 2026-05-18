/**
 * Mission Control — Constants
 */

import { RUNTIME_FLAVOR_DESCRIPTIONS, RUNTIME_FLAVOR_LABELS } from '@/lib/runtimes/runtime-flavors'

/** How often to poll feed events (ms) */
export const FEED_POLL_INTERVAL = 3000

/** How often to poll agent list (ms) */
export const AGENT_LIST_POLL_INTERVAL = 10000

/** Slow heartbeat poll when Realtime is connected (ms) */
export const REALTIME_HEARTBEAT_INTERVAL = 30_000

/** Default approval timeout (seconds) */
export const APPROVAL_TIMEOUT_SECONDS = 300

/** Loop detection: max same tool+args calls before flagging */
export const LOOP_DETECTION_THRESHOLD = 3

/** Risk level colors for UI */
export const RISK_COLORS = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
} as const

/** Risk level badge variants */
export const RISK_BADGE_VARIANTS = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
} as const

/** Agent status colors */
export const STATUS_COLORS = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  stopped: 'bg-zinc-400',
  failed: 'bg-red-500',
  error: 'bg-red-500',
  idle: 'bg-gray-400',
} as const

// ── Personality layer (re-exported from centralized expressions) ─────
export {
  pickExpression,
  getStatusLabel,
  getEventLabel,
  getPresenceLabel,
  getConnectionLabel,
  STATUS_EXPRESSIONS,
  EVENT_EXPRESSIONS,
  PRESENCE_EXPRESSIONS,
  CONNECTION_EXPRESSIONS,
} from '@/lib/expressions'

/** @deprecated Use getEventLabel() for rotating expressions */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  tool_call: 'Reaching for a tool',
  tool_result: 'Got something back',
  error: 'Stumbled',
  approval_requested: 'Asking permission',
  approval_resolved: 'Got the green light',
  run_started: 'Waking up',
  run_finished: 'Wrapping up',
  agent_paused: 'Taking a nap',
  agent_resumed: 'Back at it',
  message_received: 'Heard something',
  message_sent: 'Spoke up',
  transaction_submitted: 'Sending it',
  transaction_confirmed: 'Nailed it',
  transaction_failed: 'Oops, bounced',
  remediation_triggered: 'Self-healing',
}

/** Runtime connection status colors */
export const CONNECTION_STATUS_COLORS = {
  connected: 'bg-green-500',
  stale: 'bg-amber-500',
  offline: 'bg-zinc-400',
} as const

/** @deprecated Use getConnectionLabel() for rotating expressions */
export const CONNECTION_STATUS_LABELS = {
  connected: 'Alive & kicking',
  stale: 'Drifting off',
  offline: 'Gone quiet',
} as const

/** Runtime provider labels */
export const PROVIDER_LABELS: Record<string, string> = {
  railway: 'Railway',
  akash: 'Akash',
  phala: 'Phala',
  'io.net': 'io.net',
  nosana: 'Nosana',
  docker: 'Docker',
  manual: 'Manual',
} as const

/** Providers used for Lucid-managed runtimes */
export const MANAGED_PROVIDERS = ['railway'] as const

/** Providers available for BYO runtimes */
export const BYO_PROVIDERS = ['railway', 'akash', 'phala', 'io.net', 'nosana', 'docker', 'manual'] as const

/** Deployment mode labels and descriptions for the create dialog */
export const DEPLOYMENT_MODE_CONFIG = {
  shared: {
    label: RUNTIME_FLAVOR_LABELS.shared,
    description: RUNTIME_FLAVOR_DESCRIPTIONS.shared,
  },
  dedicated: {
    label: RUNTIME_FLAVOR_LABELS.c1_managed,
    description: RUNTIME_FLAVOR_DESCRIPTIONS.c1_managed,
  },
  byo: {
    label: RUNTIME_FLAVOR_LABELS.c2a_autonomous,
    description: RUNTIME_FLAVOR_DESCRIPTIONS.c2a_autonomous,
  },
} as const

/** How often to poll runtimes (ms) */
export const RUNTIME_POLL_INTERVAL = 30_000

/** Format a timestamp as relative time (e.g., "5m ago") */
export function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Elevated tools that may need approval */
export const ELEVATED_TOOLS = [
  'dex_swap',
  'wallet_transfer',
  'hl_place_order',
  'hl_cancel_order',
] as const

/**
 * Agent presence state config — colors + breathing for UI.
 * Labels come from centralized expressions (getPresenceLabel).
 */
export const PRESENCE_STATE_CONFIG = {
  idle: {
    dotColor: 'bg-zinc-500',
    textColor: 'text-zinc-500',
    breathe: true,
  },
  receiving: {
    dotColor: 'bg-blue-400',
    textColor: 'text-blue-400',
    breathe: true,
  },
  thinking: {
    dotColor: 'bg-amber-400',
    textColor: 'text-amber-400',
    breathe: true,
  },
  'tool-calling': {
    dotColor: 'bg-violet-400',
    textColor: 'text-violet-400',
    breathe: true,
  },
  responding: {
    dotColor: 'bg-emerald-400',
    textColor: 'text-emerald-400',
    breathe: true,
  },
} as const
