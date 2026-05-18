/**
 * Pulse Processor Executor
 *
 * Wraps existing processor functions (processInboundEvent, processOutboundEvent,
 * processScheduledTask) behind the StepExecutor interface.
 *
 * Zero behavior change — this is a pure interface adapter.
 * Exceptions propagate to BaseWorker's existing catch block (throw = fail).
 */

import type { StepExecutor, StepExecutionContext } from './types.js'
import { withSpan } from '../../observability/tracing.js'
import { repairOrScheduleCompletedInboundDelivery } from '../legacy-inbound-repair.js'
import { claimOrReclaimPulseEvent, createPulseLockOwner, getPulseEventColumns, isLegacyLockOwner } from '../ownership.js'

export class ProcessorExecutor implements StepExecutor {
  readonly type = 'processor'

  canHandle(stepType: string): boolean {
    return stepType === 'inbound' || stepType === 'outbound' || stepType === 'scheduled'
  }

  async execute(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, config, encryptionService } = ctx
    const stepType = job.stepType ?? job.eventType

    await withSpan('pulse.step.execute', {
      'lucid.pulse.step_type': stepType,
      'lucid.pulse.executor_type': this.type,
      'lucid.pulse.agent_id': job.agentId,
    }, async () => {
      switch (stepType) {
        case 'inbound':
          await this.processInbound(ctx)
          break
        case 'outbound':
          await this.processOutbound(ctx)
          break
        case 'scheduled':
          await this.processScheduled(ctx)
          break
        default:
          throw new Error(`ProcessorExecutor cannot handle step type: ${stepType}`)
      }
    })
  }

  private async processInbound(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, config, encryptionService } = ctx
    const lockOwner = createPulseLockOwner(job.runId)

    const { data: event, error } = await supabase
      .from('assistant_inbound_events')
      .select(getPulseEventColumns('assistant_inbound_events'))
      .eq('id', job.eventId)
      .single()

    if (error || !event) {
      console.error(`[pulse:processor:inbound] Event ${job.eventId} not found:`, error?.message)
      return // Complete without error — event may have been deleted
    }
    const inboundEvent = event as unknown as {
      id: string
      created_at?: string | null
      channel_id: string
      external_message_id: string
      external_user_id: string
      external_chat_id: string
      message_text: string | null
      message_data: Record<string, unknown> | null
      attempts: number
      max_attempts: number
      status: string
      locked_by?: string | null
      locked_at?: string | null
      locked_until?: string | null
      processing_started_at?: string | null
    }

    const inboundClaim = await claimOrReclaimPulseEvent({
      supabase,
      table: 'assistant_inbound_events',
      logPrefix: '[pulse:processor:inbound]',
      eventId: job.eventId,
      event: inboundEvent,
      lockOwner,
    })
    if (!inboundClaim.proceed) {
      if (isLegacyLockOwner(inboundEvent.locked_by)) {
        await repairOrScheduleCompletedInboundDelivery({
          supabase,
          config,
          encryptionService,
          eventId: job.eventId,
          logPrefix: '[pulse:processor:inbound]',
        })
      }
      return
    }

    const { processInboundEvent } = await import('../../processors/inbound.js')
    await processInboundEvent(inboundClaim.event, supabase, config, encryptionService)

    await repairOrScheduleCompletedInboundDelivery({
      supabase,
      config,
      encryptionService,
      eventId: job.eventId,
      logPrefix: '[pulse:processor:inbound]',
    })
  }

  private async processOutbound(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, config } = ctx
    const lockOwner = createPulseLockOwner(job.runId)

    const { data: event, error } = await supabase
      .from('assistant_outbound_events')
      .select(getPulseEventColumns('assistant_outbound_events'))
      .eq('id', job.eventId)
      .single()

    if (error || !event) {
      console.error(`[pulse:processor:outbound] Event ${job.eventId} not found:`, error?.message)
      return
    }
    const outboundEvent = event as unknown as {
      id: string
      channel_id: string
      inbound_event_id: string | null
      conversation_id: string | null
      message_text: string
      reply_to_external_id: string | null
      attempts: number
      max_attempts: number
      status: string
      locked_by?: string | null
      locked_at?: string | null
      locked_until?: string | null
    }

    const outboundClaim = await claimOrReclaimPulseEvent({
      supabase,
      table: 'assistant_outbound_events',
      logPrefix: '[pulse:processor:outbound]',
      eventId: job.eventId,
      event: outboundEvent,
      lockOwner,
    })
    if (!outboundClaim.proceed) return

    const { processOutboundEvent } = await import('../../processors/outbound.js')
    await processOutboundEvent(outboundClaim.event, supabase, config)
  }

  private async processScheduled(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, config } = ctx

    const { data: task, error } = await supabase
      .from('agent_scheduled_tasks')
      .select('id, assistant_id, org_id, task_prompt, cron_expression, timezone, max_retries, retry_count, run_count, channel_id, conversation_id, name, webhook_url, task_kind, target_type, target_id, team_id, project_id, work_item_id, trigger_kind, trigger_config, context_policy, knowledge_scope, trustgate_policy, dispatch_policy, managed_resource_id, next_run_at')
      .eq('id', job.eventId)
      .single()

    if (error || !task) {
      console.error(`[pulse:processor:scheduled] Task ${job.eventId} not found:`, error?.message)
      return
    }

    const { processScheduledTask } = await import('../../processors/scheduled.js')
    await processScheduledTask(task, supabase, config)
  }
}
