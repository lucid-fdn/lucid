import { createHash } from 'crypto'
import { calculateNextRun } from '@/lib/scheduler/cron-utils'
import type {
  ScheduledTask,
  ScheduledTaskDefinitionSnapshot,
} from '@/lib/mission-control/types'

export const SCHEDULED_TASK_DEFINITION_SNAPSHOT_SCHEMA_VERSION =
  'scheduled-task-definition.v1' as const
export const REDACTED_SCHEDULED_TASK_WEBHOOK_URL = '[REDACTED_WEBHOOK_URL]'

type ScheduledTaskSnapshotInput =
  | ScheduledTask
  | ScheduledTaskDefinitionSnapshot
  | Record<string, unknown>

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function booleanOrFallback(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function isSafeScheduledTaskWebhookRef(value: string | null | undefined): value is string {
  if (!value) return false
  const trimmed = value.trim()
  return (
    trimmed.startsWith('env:') ||
    trimmed.startsWith('secret:') ||
    trimmed.startsWith('secret://') ||
    trimmed.startsWith('vault://') ||
    trimmed.startsWith('lucid-secret://') ||
    trimmed.startsWith('${{ secrets.')
  )
}

function sanitizeWebhookUrl(value: unknown): Pick<
  ScheduledTaskDefinitionSnapshot,
  'webhook_url' | 'webhook_url_redacted'
> {
  const webhookUrl = stringOrNull(value)
  if (!webhookUrl) {
    return { webhook_url: null, webhook_url_redacted: false }
  }
  if (isSafeScheduledTaskWebhookRef(webhookUrl)) {
    return { webhook_url: webhookUrl, webhook_url_redacted: false }
  }
  return {
    webhook_url: REDACTED_SCHEDULED_TASK_WEBHOOK_URL,
    webhook_url_redacted: true,
  }
}

export function buildScheduledTaskDefinitionSnapshot(
  task: ScheduledTaskSnapshotInput,
): ScheduledTaskDefinitionSnapshot {
  const source = task as Record<string, unknown>
  const enabled = booleanOrFallback(source.enabled, true)
  const webhook = sanitizeWebhookUrl(source.webhook_url)

  return {
    schema_version: SCHEDULED_TASK_DEFINITION_SNAPSHOT_SCHEMA_VERSION,
    id: stringOrFallback(source.id, ''),
    assistant_id: stringOrFallback(source.assistant_id, ''),
    org_id: stringOrFallback(source.org_id, ''),
    name: stringOrFallback(source.name, 'Untitled routine'),
    description: stringOrNull(source.description),
    task_prompt: stringOrFallback(source.task_prompt, ''),
    cron_expression: stringOrNull(source.cron_expression),
    timezone: stringOrFallback(source.timezone, 'UTC'),
    run_at: stringOrNull(source.run_at),
    max_retries: numberOrFallback(source.max_retries, 0),
    enabled,
    ...webhook,
  }
}

export function buildScheduledTaskSnapshotHash(task: ScheduledTaskSnapshotInput): string {
  return createHash('sha256')
    .update(stableStringify(buildScheduledTaskDefinitionSnapshot(task)))
    .digest('hex')
}

export function buildScheduledTaskRestorePatch(
  snapshot: ScheduledTaskSnapshotInput,
): Record<string, unknown> {
  const definition = buildScheduledTaskDefinitionSnapshot(snapshot)
  const nextRun = definition.cron_expression
    ? calculateNextRun(definition.cron_expression, new Date(), definition.timezone ?? 'UTC')
    : definition.run_at && new Date(definition.run_at).getTime() > Date.now()
      ? new Date(definition.run_at)
      : null

  const patch: Record<string, unknown> = {
    name: definition.name,
    description: definition.description,
    task_prompt: definition.task_prompt,
    cron_expression: definition.cron_expression,
    timezone: definition.timezone ?? 'UTC',
    run_at: definition.run_at,
    max_retries: definition.max_retries,
    enabled: definition.enabled,
    status: definition.enabled ? 'pending' : 'cancelled',
    next_run_at: nextRun?.toISOString() ?? null,
    last_error: null,
    claimed_by: null,
    claimed_at: null,
  }

  if (!definition.webhook_url_redacted) {
    patch.webhook_url = definition.webhook_url
  }

  return patch
}
