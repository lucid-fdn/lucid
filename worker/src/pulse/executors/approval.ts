/**
 * Pulse Approval Executor
 *
 * Creates a standalone approval step that polls mc_pending_approvals
 * for owner resolution. Reuses the same table/UI as the inline
 * approval-gate.ts but as a Pulse step (not embedded in tool execution).
 *
 * Risk level is server-derived via estimateRiskLevel() — never from the caller.
 * Timeout marks 'expired' (not 'denied') matching existing approval-gate.ts behavior.
 *
 * Throw-based contract: returns void on success, throws on failure.
 * BaseWorker handles queue.complete() / queue.fail().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StepExecutor, StepExecutionContext } from './types.js'
import { createStep, updateStepStatus } from './step-tracker.js'
import { estimateRiskLevel } from '../../agent/approval-gate.js'
import { withSpan } from '../../observability/tracing.js'

const DEFAULT_TIMEOUT_SECONDS = 300 // 5 minutes
const MIN_TIMEOUT_SECONDS = 10
const MAX_TIMEOUT_SECONDS = 1800    // 30 minutes
const POLL_INTERVAL_MS = 2_000
const MAX_CONSECUTIVE_POLL_ERRORS = 10

export { estimateRiskLevel }

export class ApprovalExecutor implements StepExecutor {
  readonly type = 'approval'

  canHandle(stepType: string): boolean {
    return stepType === 'approval'
  }

  async execute(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, abortController } = ctx
    const approvalConfig = job.approvalConfig

    if (!approvalConfig) {
      throw new Error('approvalConfig is required for approval step')
    }

    const { toolName, toolArgs, timeoutSeconds: configTimeout } = approvalConfig

    // Validate + clamp timeout (P1 fix: reject 0/negative/NaN)
    const rawTimeout = configTimeout ?? DEFAULT_TIMEOUT_SECONDS
    const timeoutSeconds = Number.isFinite(rawTimeout) && rawTimeout >= MIN_TIMEOUT_SECONDS
      ? Math.min(rawTimeout, MAX_TIMEOUT_SECONDS)
      : DEFAULT_TIMEOUT_SECONDS
    const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString()

    // Create orchestration step record (best-effort — log but don't block)
    const stepId = await createStep(supabase, {
      runId: job.runId,
      eventId: job.eventId,
      attempt: job.attempt,
      stepType: 'approval',
      executorType: this.type,
      agentId: job.agentId,
      orgId: job.orgId,
      timeoutAt,
      input: { toolName, toolArgs },
    })

    // P1 fix: step tracking is best-effort observability — log but proceed without stepId
    if (!stepId) {
      console.error('[pulse:approval] Failed to create orchestration step — proceeding without step tracking')
    }

    // Risk level derived server-side (reuses approval-gate.ts — no duplication)
    const riskLevel = estimateRiskLevel(toolName)

    // Insert mc_pending_approvals row
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString()

    const { data: approval, error: insertError } = await supabase
      .from('mc_pending_approvals')
      .insert({
        org_id: job.orgId,
        agent_id: job.agentId,
        run_id: job.runId,
        tool_name: toolName,
        tool_args: toolArgs,
        risk_level: riskLevel,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (insertError || !approval) {
      const msg = insertError?.message ?? 'Failed to insert pending approval'
      if (stepId) {
        await updateStepStatus(supabase, stepId, {
          status: 'failed',
          errorMessage: msg,
          completedAt: new Date().toISOString(),
        })
      }
      throw new Error(msg)
    }

    const approvalId = approval.id

    // Link approval to step (best-effort)
    if (stepId) {
      await updateStepStatus(supabase, stepId, {
        status: 'running',
        approvalId,
      })
    }

    // Poll for resolution
    await withSpan('pulse.step.approval.wait', {
      'lucid.pulse.step_type': 'approval',
      'lucid.pulse.approval_id': approvalId,
      'lucid.pulse.tool_name': toolName,
    }, () => this.pollForResolution(supabase, stepId, approvalId, job, timeoutAt, timeoutSeconds, abortController.signal))
  }

  /**
   * Poll mc_pending_approvals for resolution.
   * Respects AbortSignal for graceful shutdown.
   */
  private async pollForResolution(
    supabase: SupabaseClient,
    stepId: string | null,
    approvalId: string,
    job: { orgId: string; runId: string },
    timeoutAt: string,
    timeoutSeconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.parse(timeoutAt)
    const startedAt = Date.now()
    let consecutivePollErrors = 0

    while (Date.now() < deadline) {
      // P1 fix: check abort both before and after sleep for prompt shutdown
      if (signal.aborted) {
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'cancelled',
            errorMessage: 'Worker shutting down',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
          })
        }
        throw new Error('Approval step cancelled: worker shutting down')
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      if (signal.aborted) {
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'cancelled',
            errorMessage: 'Worker shutting down',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
          })
        }
        throw new Error('Approval step cancelled: worker shutting down')
      }

      const result = await this.pollApprovalStatus(supabase, approvalId)

      if (result.error) {
        consecutivePollErrors++
        console.error(`[pulse:approval] Poll error (${consecutivePollErrors}/${MAX_CONSECUTIVE_POLL_ERRORS}):`, result.error)

        // P1 fix: surface real fault instead of masking as timeout
        if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          if (stepId) {
            await updateStepStatus(supabase, stepId, {
              status: 'failed',
              errorMessage: `Approval polling failed after ${MAX_CONSECUTIVE_POLL_ERRORS} consecutive errors: ${result.error}`,
              completedAt: new Date().toISOString(),
              durationMs: Date.now() - startedAt,
              metadata: { approvalId, resolution: 'poll_error' },
            })
          }
          throw new Error(`Approval polling failed: ${result.error}`)
        }
        continue
      }

      consecutivePollErrors = 0
      const status = result.status

      if (status === 'approved') {
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            metadata: { approvalId, resolution: 'approved' },
          })
        }
        return // Success — void return
      }

      if (status === 'denied') {
        const reason = await this.fetchDenialReason(supabase, approvalId)
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'failed',
            errorMessage: reason,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            metadata: { approvalId, resolution: 'denied' },
          })
        }
        throw new Error(`Approval denied: ${reason}`)
      }

      if (status === 'expired') {
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'failed',
            errorMessage: `Approval expired after ${timeoutSeconds}s`,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            metadata: { approvalId, resolution: 'expired' },
          })
        }
        throw new Error(`Approval expired after ${timeoutSeconds}s`)
      }
    }

    // P0 fix: final poll after loop exit to handle deadline race
    // The owner may have approved/denied between the last poll and now
    const finalResult = await this.pollApprovalStatus(supabase, approvalId)
    if (!finalResult.error) {
      if (finalResult.status === 'approved') {
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            metadata: { approvalId, resolution: 'approved' },
          })
        }
        return
      }
      if (finalResult.status === 'denied') {
        const reason = await this.fetchDenialReason(supabase, approvalId)
        if (stepId) {
          await updateStepStatus(supabase, stepId, {
            status: 'failed',
            errorMessage: reason,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            metadata: { approvalId, resolution: 'denied' },
          })
        }
        throw new Error(`Approval denied: ${reason}`)
      }
    }

    // Timeout — mark as 'expired' (NOT 'denied' — matches approval-gate.ts)
    await supabase
      .from('mc_pending_approvals')
      .update({ status: 'expired' })
      .eq('id', approvalId)
      .eq('status', 'pending')

    await supabase
      .from('mc_approval_log')
      .insert({
        approval_id: approvalId,
        org_id: job.orgId,
        action: 'expired',
        reason: `Timed out after ${timeoutSeconds}s`,
      })

    if (stepId) {
      await updateStepStatus(supabase, stepId, {
        status: 'failed',
        errorMessage: `Approval timed out after ${timeoutSeconds}s`,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        metadata: { approvalId, resolution: 'expired' },
      })
    }

    throw new Error(`Approval timed out after ${timeoutSeconds}s`)
  }

  /**
   * Single poll to mc_pending_approvals.
   * Returns { status } on success, { error } on failure.
   */
  private async pollApprovalStatus(
    supabase: SupabaseClient,
    approvalId: string,
  ): Promise<{ status?: string; error?: string }> {
    try {
      const { data: row, error: pollError } = await supabase
        .from('mc_pending_approvals')
        .select('status')
        .eq('id', approvalId)
        .single()

      if (pollError) return { error: pollError.message }
      return { status: row?.status }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unknown poll error' }
    }
  }

  /**
   * Fetch denial reason from mc_approval_log.
   */
  private async fetchDenialReason(
    supabase: SupabaseClient,
    approvalId: string,
  ): Promise<string> {
    try {
      const { data: logEntry } = await supabase
        .from('mc_approval_log')
        .select('reason')
        .eq('approval_id', approvalId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return logEntry?.reason ?? 'Approval denied'
    } catch {
      return 'Approval denied'
    }
  }
}
