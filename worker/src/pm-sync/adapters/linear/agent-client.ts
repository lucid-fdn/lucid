/**
 * Linear Agent Client — Activity Emission via GraphQL.
 *
 * Fire-and-forget wrapper around Linear's Agents API GraphQL mutations.
 * All methods catch errors and log warnings — they never throw. This is
 * intentional: activities are ephemeral and latency-sensitive (10s
 * deadline), so failing to emit a thought should never block the agent run.
 *
 * Uses the `linear-agent` Nango integration (actor=app OAuth) for
 * authentication. Each org has a separate Nango connection.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md AD2
 */

import { getNangoClient } from '../../../agent/oauth-tools/nango-client.js'
import { redact } from '../../../utils/pii-redactor.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityContentType =
  | 'thought'
  | 'action'
  | 'elicitation'
  | 'response'
  | 'error'

export type LinearSessionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting_input'
  | 'canceled'

export interface PlanStep {
  title: string
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'
}

export interface ExternalUrl {
  label: string
  url: string
}

// ─── GraphQL Mutations ──────────────────────────────────────────────────────

const AGENT_ACTIVITY_CREATE = `
  mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
    agentActivityCreate(input: $input) {
      success
    }
  }
`

const AGENT_SESSION_UPDATE = `
  mutation AgentSessionUpdate($input: AgentSessionUpdateInput!) {
    agentSessionUpdate(input: $input) {
      success
    }
  }
`

// ─── Client ─────────────────────────────────────────────────────────────────

export class LinearAgentClient {
  private readonly connectionId: string
  private readonly providerConfigKey: string

  constructor(connectionId: string, providerConfigKey = 'linear-agent') {
    this.connectionId = connectionId
    this.providerConfigKey = providerConfigKey
  }

  // ─── Activity Methods ───────────────────────────────────────────────────

  /**
   * Emit a thought activity (ephemeral by default).
   * Thoughts show the agent's internal reasoning to the human.
   */
  async emitThought(
    sessionId: string,
    text: string,
    ephemeral = true,
  ): Promise<void> {
    await this.createActivity(sessionId, {
      type: 'thought',
      content: text,
    }, ephemeral)
  }

  /**
   * Emit an action activity (ephemeral by default).
   * Shows tool calls the agent is making.
   */
  async emitAction(
    sessionId: string,
    name: string,
    input?: string,
    result?: string,
    ephemeral = true,
  ): Promise<void> {
    await this.createActivity(sessionId, {
      type: 'action',
      name,
      ...(input !== undefined && { input }),
      ...(result !== undefined && { result }),
    }, ephemeral)
  }

  /**
   * Emit an elicitation activity (never ephemeral).
   * Asks the human for input/clarification.
   */
  async emitElicitation(
    sessionId: string,
    content: string,
  ): Promise<void> {
    await this.createActivity(sessionId, {
      type: 'elicitation',
      content,
    }, false)
  }

  /**
   * Emit a response activity (never ephemeral).
   * The final response to the human's request.
   */
  async emitResponse(
    sessionId: string,
    content: string,
  ): Promise<void> {
    await this.createActivity(sessionId, {
      type: 'response',
      content,
    }, false)
  }

  /**
   * Emit an error activity (never ephemeral).
   * Reports a failure to the human.
   */
  async emitError(
    sessionId: string,
    message: string,
    errorCode?: string,
  ): Promise<void> {
    await this.createActivity(sessionId, {
      type: 'error',
      content: message,
      ...(errorCode !== undefined && { errorCode }),
    }, false)
  }

  // ─── Session Methods ────────────────────────────────────────────────────

  /**
   * Publish a step-by-step plan on the Linear session.
   */
  async publishPlan(
    sessionId: string,
    steps: PlanStep[],
  ): Promise<void> {
    const plan = steps.map((s) => ({
      title: s.title,
      ...(s.description !== undefined && { description: s.description }),
      ...(s.status !== undefined && { status: s.status }),
    }))
    await this.updateSession(sessionId, { plan })
  }

  /**
   * Set an external URL on the session (e.g., link to Lucid Mission Control).
   */
  async setExternalUrl(
    sessionId: string,
    label: string,
    url: string,
  ): Promise<void> {
    await this.updateSession(sessionId, {
      externalUrls: [{ label, url }],
    })
  }

  /**
   * Update the session status (running, completed, failed, etc.).
   */
  async updateSessionStatus(
    sessionId: string,
    status: LinearSessionStatus,
  ): Promise<void> {
    await this.updateSession(sessionId, { status })
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  private async createActivity(
    sessionId: string,
    content: Record<string, unknown>,
    ephemeral: boolean,
  ): Promise<void> {
    try {
      const nango = getNangoClient()
      if (!nango) {
        console.warn('[LinearAgentClient] Nango client not configured, skipping activity')
        return
      }

      const resp = await nango.post({
        connectionId: this.connectionId,
        providerConfigKey: this.providerConfigKey,
        endpoint: '/graphql',
        data: {
          query: AGENT_ACTIVITY_CREATE,
          variables: {
            input: {
              agentSessionId: sessionId,
              content,
              ephemeral,
            },
          },
        },
        headers: { 'Content-Type': 'application/json' },
        retries: 1,
      })
      // Check for GraphQL-level errors (HTTP 200 but with errors array)
      const body = resp?.data as { errors?: Array<{ message: string }> } | undefined
      if (body?.errors?.length) {
        console.warn(
          '[LinearAgentClient] GraphQL error creating activity:',
          {
            contentType: content.type,
            sessionId: redact(sessionId),
            error: redact(body.errors[0].message),
          },
        )
      }
    } catch (err) {
      const status = (err as { status?: number }).status
      console.warn(
        '[LinearAgentClient] Failed to create activity:',
        {
          contentType: content.type,
          sessionId: redact(sessionId),
          status: status ?? 'unknown',
          error: redact(err instanceof Error ? err.message : String(err)),
        },
      )
    }
  }

  private async updateSession(
    sessionId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    try {
      const nango = getNangoClient()
      if (!nango) {
        console.warn('[LinearAgentClient] Safe configuration warning: Nango client not configured, skipping session update')
        return
      }

      const resp = await nango.post({
        connectionId: this.connectionId,
        providerConfigKey: this.providerConfigKey,
        endpoint: '/graphql',
        data: {
          query: AGENT_SESSION_UPDATE,
          variables: {
            input: {
              id: sessionId,
              ...fields,
            },
          },
        },
        headers: { 'Content-Type': 'application/json' },
        retries: 3, // Status updates are important — retry more aggressively
      })
      // Check for GraphQL-level errors (HTTP 200 but with errors array)
      const body = resp?.data as { errors?: Array<{ message: string }> } | undefined
      if (body?.errors?.length) {
        console.warn(
          `[LinearAgentClient] GraphQL error updating session ${redact(sessionId)}:`,
          redact(body.errors[0].message),
        )
      }
    } catch (err) {
      const status = (err as { status?: number }).status
      console.warn(
        `[LinearAgentClient] Failed to update session ${redact(sessionId)} (status=${status ?? 'unknown'}):`,
        redact((err as Error).message),
      )
    }
  }
}
