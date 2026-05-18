/**
 * Pulse Scheduled Worker
 *
 * Claims from pulse:{scheduled}:* ZSETs, delegates to processScheduledTask().
 *
 * Phase 3N: process() kept as backwards-compatible fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../../config.js'
import type { PulseJob, PulseEventType, PulseConfig } from '../types.js'
import { BaseWorker } from './base-worker.js'
import { PulseQueue } from '../queue.js'
import type { ExecutorRegistry } from '../executors/registry.js'
import type { IncrementalScheduler } from '../dag/scheduler.js'

export class ScheduledWorker extends BaseWorker {
  constructor(
    queue: PulseQueue,
    workerId: string,
    supabase: SupabaseClient,
    appConfig: Config,
    config?: Partial<PulseConfig>,
    executorRegistry?: ExecutorRegistry,
    dagScheduler?: IncrementalScheduler,
  ) {
    super(queue, workerId, config, {
      executorRegistry,
      supabase,
      workerConfig: appConfig,
      dagScheduler,
    })
  }

  getEventType(): PulseEventType {
    return 'scheduled'
  }

  protected override getMaxInflight(): number {
    // Scheduled automation is background work on the shared worker.
    // Keep it single-flight so interactive traffic keeps provider headroom.
    return 1
  }

  protected override async shouldDeferClaim(): Promise<boolean> {
    const interactiveActive =
      this.getActiveEventCount('inbound') > 0 || this.getActiveEventCount('outbound') > 0
    if (interactiveActive) return true

    const [inboundBacklog, outboundBacklog] = await Promise.all([
      this.queue.getQueueBacklog('inbound'),
      this.queue.getQueueBacklog('outbound'),
    ])
    return inboundBacklog.backlog > 0 || outboundBacklog.backlog > 0
  }

  async process(job: PulseJob): Promise<void> {
    // Fallback path — used when no executor registry or no matching executor
    const { data: task, error } = await this.supabase!
      .from('agent_scheduled_tasks')
      .select('id, assistant_id, org_id, task_prompt, cron_expression, timezone, max_retries, retry_count, run_count, channel_id, conversation_id, name, webhook_url, task_kind, target_type, target_id, team_id, project_id, work_item_id, trigger_kind, trigger_config, context_policy, knowledge_scope, trustgate_policy, dispatch_policy, managed_resource_id, next_run_at')
      .eq('id', job.eventId)
      .single()

    if (error || !task) {
      console.error(`[pulse:scheduled] Task ${job.eventId} not found:`, error?.message)
      return
    }

    // Delegate to extracted processor
    const { processScheduledTask } = await import('../../processors/scheduled.js')
    await processScheduledTask(task, this.supabase!, this.workerConfig!)
  }
}
