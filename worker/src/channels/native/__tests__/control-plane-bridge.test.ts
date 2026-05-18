/**
 * Phase 2: ControlPlaneBridge event mirroring tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ControlPlaneBridge } from '../ControlPlaneBridge.js'

vi.mock('../../../runtime/event-reporter.js', () => ({
  reportEvent: vi.fn(),
}))

describe('ControlPlaneBridge', () => {
  let bridge: ControlPlaneBridge

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = new ControlPlaneBridge()
  })

  it('reports message_received with preview truncated to 100 chars', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')
    const longText = 'a'.repeat(200)

    bridge.onMessageReceived('telegram', 'bot_123', 'user456', longText)

    expect(reportEvent).toHaveBeenCalledWith({
      eventType: 'message_received',
      severity: 'info',
      payload: {
        channel: 'telegram',
        accountId: 'bot_123',
        from: 'user456',
        source: 'native',
        preview: 'a'.repeat(100),
      },
    })
  })

  it('reports message_sent', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onMessageSent('discord', 'guild_789', 'user123')

    expect(reportEvent).toHaveBeenCalledWith({
      eventType: 'message_sent',
      severity: 'info',
      payload: { channel: 'discord', accountId: 'guild_789', to: 'user123', source: 'native' },
    })
  })

  it('reports run_started with agentId', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onRunStarted('agent-id-1', 'run-id-1')

    expect(reportEvent).toHaveBeenCalledWith({
      agentId: 'agent-id-1',
      eventType: 'run_started',
      severity: 'info',
      payload: { runId: 'run-id-1', source: 'native' },
    })
  })

  it('reports run_finished with token count', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onRunFinished('agent-id-1', 'run-id-1', 500)

    expect(reportEvent).toHaveBeenCalledWith({
      agentId: 'agent-id-1',
      eventType: 'run_finished',
      severity: 'info',
      payload: { runId: 'run-id-1', tokens: 500, source: 'native' },
    })
  })

  it('reports channel_connected', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onChannelConnected('discord', 'guild_1')

    expect(reportEvent).toHaveBeenCalledWith({
      eventType: 'channel_connected',
      severity: 'info',
      payload: { channel: 'discord', accountId: 'guild_1' },
    })
  })

  it('reports channel_disconnected with reason', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onChannelDisconnected('telegram', 'bot_1', 'timeout')

    expect(reportEvent).toHaveBeenCalledWith({
      eventType: 'channel_disconnected',
      severity: 'warning',
      payload: { channel: 'telegram', accountId: 'bot_1', reason: 'timeout' },
    })
  })

  it('reports channel_deactivated with severity critical', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onChannelDeactivated('slack', 'team_42', 'token_revoked')

    expect(reportEvent).toHaveBeenCalledWith({
      eventType: 'channel_deactivated',
      severity: 'critical',
      payload: {
        channel: 'slack',
        accountId: 'team_42',
        reason: 'token_revoked',
        source: 'native_channel',
      },
    })
  })

  it('reports channel error with severity error', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    bridge.onChannelError('whatsapp', 'phone_1', 'Token revoked')

    expect(reportEvent).toHaveBeenCalledWith({
      eventType: 'error',
      severity: 'error',
      payload: {
        channel: 'whatsapp',
        accountId: 'phone_1',
        error: 'Token revoked',
        source: 'native_channel',
      },
    })
  })
})
