/**
 * Linear Agent Session Executor
 *
 * Pulse executor for `linear_agent_session` step type. Loads the
 * session from DB, creates a LinearAgentClient, and delegates to
 * processLinearAgentRun for the actual agent run + activity emission.
 *
 * Follows BaseWorker's throw-based contract:
 *   - Return void → BaseWorker calls queue.complete()
 *   - Throw → BaseWorker calls queue.fail()
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 2
 */

import type { StepExecutionContext, StepExecutor } from './types.js'
import { getLinearSessionById } from '../../pm-sync/adapters/linear/agent-session-db.js'
import { LinearAgentClient } from '../../pm-sync/adapters/linear/agent-client.js'
import { processLinearAgentRun } from '../../pm-sync/adapters/linear/agent-run-processor.js'
import { withSpan } from '../../observability/tracing.js'
import { redact } from '../../utils/pii-redactor.js'

/**
 * Resolve the Nango connection ID for the linear-agent integration.
 * The connection ID is stored in org_pm_config.config or defaults to the orgId.
 */
async function resolveConnectionId(
  ctx: StepExecutionContext,
  orgId: string,
): Promise<string> {
  const { data } = await ctx.supabase
    .from('org_pm_config')
    .select('nango_connection_id, config')
    .eq('org_id', orgId)
    .eq('provider', 'linear')
    .maybeSingle()

  // Check for a dedicated linear-agent connection ID in config
  const agentConnectionId = (data?.config as Record<string, unknown> | null)
    ?.agentConnectionId as string | undefined

  return agentConnectionId ?? data?.nango_connection_id ?? orgId
}

export class LinearAgentSessionExecutor implements StepExecutor {
  readonly type = 'linear_agent_session'

  canHandle(stepType: string): boolean {
    return stepType === 'linear_agent_session'
  }

  async execute(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase, config } = ctx

    // The eventId carries the internal session UUID (linear_agent_sessions.id)
    const sessionId = job.eventId

    await withSpan(
      'pulse.step.execute',
      {
        'lucid.pulse.step_type': 'linear_agent_session',
        'lucid.pulse.executor_type': this.type,
        'lucid.pulse.agent_id': job.agentId,
        'lucid.pulse.session_id': sessionId,
      },
      async () => {
        // 1. Load session from DB
        const session = await getLinearSessionById(supabase, sessionId)
        if (!session) {
          console.warn(
            `[pulse:linear-agent-session] Session ${redact(sessionId)} not found - completing as noop`,
          )
          return
        }

        if (!session.agent_id) {
          console.warn(
            `[pulse:linear-agent-session] Session ${redact(sessionId)} has no agent_id - completing as noop`,
          )
          return
        }

        // 2. Resolve Nango connection ID for the linear-agent integration
        const connectionId = await resolveConnectionId(ctx, session.org_id)

        // 3. Create LinearAgentClient for this org
        const agentClient = new LinearAgentClient(connectionId)

        // 4. Build run context from session
        const runContext = {
          sessionId: session.id,
          linearSessionId: session.linear_session_id,
          orgId: session.org_id,
          agentId: session.agent_id,
          issueTitle: session.linear_issue_identifier
            ? `${session.linear_issue_identifier}`
            : 'Linear Issue',
          issueIdentifier: session.linear_issue_identifier ?? undefined,
          triggerType: session.trigger_type as 'assignment' | 'mention' | 'comment',
        }

        // 5. Delegate to the run processor
        await processLinearAgentRun(runContext, {
          supabase,
          config,
          agentClient,
          connectionId,
        })
      },
    )
  }
}
