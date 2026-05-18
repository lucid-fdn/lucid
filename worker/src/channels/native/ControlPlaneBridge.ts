/**
 * ControlPlaneBridge — Mirrors native channel events to the control plane.
 *
 * C2a self-sovereign agents process messages in-process but the control plane
 * needs to see everything for audit, billing, and governance.
 * Reuses the existing event-reporter batch system (5s flush).
 */

import { reportEvent } from '../../runtime/event-reporter.js'

export class ControlPlaneBridge {
  onMessageReceived(channel: string, accountId: string, from: string, text: string): void {
    reportEvent({
      eventType: 'message_received',
      severity: 'info',
      payload: { channel, accountId, from, source: 'native', preview: text.slice(0, 100) },
    })
  }

  onMessageSent(channel: string, accountId: string, to: string): void {
    reportEvent({
      eventType: 'message_sent',
      severity: 'info',
      payload: { channel, accountId, to, source: 'native' },
    })
  }

  onRunStarted(agentId: string, runId: string): void {
    reportEvent({
      agentId,
      eventType: 'run_started',
      severity: 'info',
      payload: { runId, source: 'native' },
    })
  }

  onRunFinished(agentId: string, runId: string, tokens: number): void {
    reportEvent({
      agentId,
      eventType: 'run_finished',
      severity: 'info',
      payload: { runId, tokens, source: 'native' },
    })
  }

  onChannelConnected(channel: string, accountId: string): void {
    reportEvent({
      eventType: 'channel_connected',
      severity: 'info',
      payload: { channel, accountId },
    })
  }

  onChannelDisconnected(channel: string, accountId: string, reason: string): void {
    reportEvent({
      eventType: 'channel_disconnected',
      severity: 'warning',
      payload: { channel, accountId, reason },
    })
  }

  onChannelError(channel: string, accountId: string, error: string): void {
    reportEvent({
      eventType: 'error',
      severity: 'error',
      payload: { channel, accountId, error, source: 'native_channel' },
    })
  }

  /**
   * Permanent failure — credentials revoked, account suspended, etc.
   * Distinct from `onChannelError` because the operator must rotate
   * credentials before the channel can come back. Surfaced in MC as a
   * critical event so it isn't lost in the noise of transient errors.
   */
  onChannelDeactivated(channel: string, accountId: string, reason: string): void {
    reportEvent({
      eventType: 'channel_deactivated',
      severity: 'critical',
      payload: { channel, accountId, reason, source: 'native_channel' },
    })
  }
}
