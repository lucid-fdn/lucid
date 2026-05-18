/**
 * Stable tool names — the LLM contract.
 *
 * Cron names are Lucid-invented (OpenClaw's native `cron` is a single
 * multiplexed tool with an `action` param). sessions_send/sessions_spawn
 * match OpenClaw upstream names exactly.
 */

// Runtime tools — old names → new stable names
export const TOOL_NAME_MAP = {
  schedule_task: 'cron_schedule',
  list_scheduled_tasks: 'cron_list',
  cancel_scheduled_task: 'cron_cancel',
  send_message_to_agent: 'sessions_send',
  spawn_subagent: 'sessions_spawn',
} as const

// New stable names
export const CRON_SCHEDULE = 'cron_schedule' as const
export const CRON_LIST = 'cron_list' as const
export const CRON_CANCEL = 'cron_cancel' as const
export const SESSIONS_SEND = 'sessions_send' as const
export const SESSIONS_SPAWN = 'sessions_spawn' as const

/** All new stable runtime tool names */
export const RUNTIME_TOOL_STABLE_NAMES: Set<string> = new Set([
  CRON_SCHEDULE, CRON_LIST, CRON_CANCEL,
  SESSIONS_SEND, SESSIONS_SPAWN,
])

/** Reverse map: new name → old name (for transition-period aliasing) */
export const REVERSE_TOOL_NAME_MAP = Object.fromEntries(
  Object.entries(TOOL_NAME_MAP).map(([old, stable]) => [stable, old])
) as Record<string, string>
