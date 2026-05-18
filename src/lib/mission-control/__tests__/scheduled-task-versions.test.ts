import { describe, expect, it } from 'vitest'
import {
  REDACTED_SCHEDULED_TASK_WEBHOOK_URL,
  buildScheduledTaskDefinitionSnapshot,
  buildScheduledTaskRestorePatch,
  buildScheduledTaskSnapshotHash,
} from '@/lib/mission-control/scheduled-task-versions'
import type { ScheduledTask } from '@/lib/mission-control/types'

const baseTask: ScheduledTask = {
  id: 'task-1',
  assistant_id: 'assistant-1',
  org_id: 'org-1',
  name: 'Daily QA',
  description: 'Check the production site',
  task_prompt: 'Check https://www.lucid.foundation',
  cron_expression: '0 9 * * *',
  timezone: 'UTC',
  run_at: null,
  status: 'pending',
  last_run_at: null,
  last_error: null,
  next_run_at: '2026-05-07T09:00:00.000Z',
  run_count: 0,
  retry_count: 0,
  max_retries: 3,
  enabled: true,
  webhook_url: 'https://hooks.slack.com/services/TOKEN/SECRET',
  created_at: '2026-05-07T00:00:00.000Z',
  updated_at: '2026-05-07T00:00:00.000Z',
}

describe('scheduled task version snapshots', () => {
  it('stores scheduler definitions only and redacts unsafe webhook URLs', () => {
    const snapshot = buildScheduledTaskDefinitionSnapshot(baseTask)

    expect(snapshot).toEqual(expect.objectContaining({
      schema_version: 'scheduled-task-definition.v1',
      id: 'task-1',
      name: 'Daily QA',
      task_prompt: 'Check https://www.lucid.foundation',
      webhook_url: REDACTED_SCHEDULED_TASK_WEBHOOK_URL,
      webhook_url_redacted: true,
    }))
    expect(snapshot).not.toHaveProperty('last_run_at')
    expect(snapshot).not.toHaveProperty('last_error')
    expect(snapshot).not.toHaveProperty('next_run_at')
    expect(snapshot).not.toHaveProperty('run_count')
    expect(snapshot).not.toHaveProperty('retry_count')
    expect(snapshot).not.toHaveProperty('status')
    expect(snapshot).not.toHaveProperty('created_at')
    expect(snapshot).not.toHaveProperty('updated_at')
  })

  it('does not change the snapshot hash for volatile runtime updates', () => {
    const updatedRuntimeState: ScheduledTask = {
      ...baseTask,
      last_run_at: '2026-05-07T09:00:00.000Z',
      last_error: 'A transient error that should not affect restore conflicts',
      next_run_at: '2026-05-08T09:00:00.000Z',
      run_count: 42,
      retry_count: 2,
      status: 'running',
      updated_at: '2026-05-07T10:00:00.000Z',
    }

    expect(buildScheduledTaskSnapshotHash(updatedRuntimeState)).toBe(
      buildScheduledTaskSnapshotHash(baseTask),
    )
  })

  it('changes the snapshot hash for definition updates', () => {
    expect(buildScheduledTaskSnapshotHash({
      ...baseTask,
      task_prompt: 'Check the checkout flow',
    })).not.toBe(buildScheduledTaskSnapshotHash(baseTask))
  })

  it('keeps safe secret refs restorable and omits redacted raw webhooks from restore patches', () => {
    const safeSnapshot = buildScheduledTaskDefinitionSnapshot({
      ...baseTask,
      webhook_url: 'secret://slack/daily-qa-webhook',
    })
    const redactedSnapshot = buildScheduledTaskDefinitionSnapshot(baseTask)

    expect(buildScheduledTaskRestorePatch(safeSnapshot)).toEqual(expect.objectContaining({
      webhook_url: 'secret://slack/daily-qa-webhook',
    }))
    expect(buildScheduledTaskRestorePatch(redactedSnapshot)).not.toHaveProperty('webhook_url')
  })
})
