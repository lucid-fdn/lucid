/**
 * NativeChannelManager — Multi-Channel + Governance Flow Tests
 *
 * Tests simultaneous multi-channel operation, selective governance,
 * snapshot isolation, and concurrent pause/resume sequences.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NativeChannelManager, type AgentRunner, type GovernanceAction } from '../NativeChannelManager.js'
import {
  registerNativeChannelAdapter,
  __resetNativeChannelAdapters,
  type NativeChannelAdapter,
} from '../adapter-registry.js'
import type { Config } from '../../../config.js'

// Mock event reporter
vi.mock('../../../runtime/event-reporter.js', () => ({
  reportEvent: vi.fn(),
}))

// Healthy fake adapter — start succeeds, stop is a no-op. The manager now
// requires a registered adapter for every channel type before it will mark
// the channel `connected` (the previous silent no-op was the C2a P0 bug).
function makeHealthyAdapter(channelType: string): NativeChannelAdapter {
  return {
    channelType,
    async start() {},
  }
}

function makeConfig(channels: Array<{ channelType: string; accountId: string; credentials?: Record<string, string> }>): Config {
  return {
    OPENCLAW_CHANNEL_CONFIG: JSON.stringify(channels.map(c => ({
      channelType: c.channelType,
      accountId: c.accountId,
      credentials: c.credentials || {},
    }))),
  } as any
}

const ALL_CHANNEL_TYPES = [
  { channelType: 'telegram', accountId: 'tg_bot_1' },
  { channelType: 'discord', accountId: 'dc_srv_1' },
  { channelType: 'whatsapp', accountId: 'wa_num_1' },
]

describe('NativeChannelManager — Multi-Channel', () => {
  let runner: AgentRunner

  beforeEach(() => {
    vi.clearAllMocks()
    runner = vi.fn().mockResolvedValue({ responseText: 'OK' })
    __resetNativeChannelAdapters()
    for (const { channelType } of ALL_CHANNEL_TYPES) {
      registerNativeChannelAdapter(makeHealthyAdapter(channelType))
    }
  })

  it('starts 3 channels simultaneously', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)

    await manager.start()

    const snapshot = manager.getSnapshot()
    expect(snapshot).toHaveLength(3)
    expect(snapshot.map(s => s.channelType).sort()).toEqual(['discord', 'telegram', 'whatsapp'])
    expect(snapshot.every(s => s.status === 'connected')).toBe(true)

    await manager.stop()
    consoleSpy.mockRestore()
  })

  it('pausing one channel does not affect others', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)
    await manager.start()

    await manager.handleAction({ type: 'pause_channel', channelType: 'discord', accountId: 'dc_srv_1' })

    const snapshot = manager.getSnapshot()
    expect(snapshot.find(s => s.channelType === 'discord')?.status).toBe('stopped')
    expect(snapshot.find(s => s.channelType === 'telegram')?.status).toBe('connected')
    expect(snapshot.find(s => s.channelType === 'whatsapp')?.status).toBe('connected')

    await manager.stop()
    consoleSpy.mockRestore()
  })

  it('pauses and resumes multiple channels independently', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)
    await manager.start()

    // Pause two
    await manager.handleAction({ type: 'pause_channel', channelType: 'telegram', accountId: 'tg_bot_1' })
    await manager.handleAction({ type: 'pause_channel', channelType: 'discord', accountId: 'dc_srv_1' })

    let snapshot = manager.getSnapshot()
    expect(snapshot.filter(s => s.status === 'stopped')).toHaveLength(2)
    expect(snapshot.filter(s => s.status === 'connected')).toHaveLength(1)

    // Resume one
    await manager.handleAction({ type: 'resume_channel', channelType: 'telegram', accountId: 'tg_bot_1' })

    snapshot = manager.getSnapshot()
    expect(snapshot.find(s => s.channelType === 'telegram')?.status).toBe('connected')
    expect(snapshot.find(s => s.channelType === 'discord')?.status).toBe('stopped')

    await manager.stop()
    consoleSpy.mockRestore()
  })

  it('stop_all_channels clears all channels', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)
    await manager.start()
    expect(manager.getSnapshot()).toHaveLength(3)

    await manager.handleAction({ type: 'stop_all_channels' })

    expect(manager.getSnapshot()).toHaveLength(0)
    consoleSpy.mockRestore()
  })

  it('sequential governance actions are all applied', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)
    await manager.start()

    const actions: GovernanceAction[] = [
      { type: 'pause_channel', channelType: 'telegram', accountId: 'tg_bot_1' },
      { type: 'pause_channel', channelType: 'discord', accountId: 'dc_srv_1' },
      { type: 'resume_channel', channelType: 'telegram', accountId: 'tg_bot_1' },
    ]

    for (const action of actions) {
      await manager.handleAction(action)
    }

    const snapshot = manager.getSnapshot()
    expect(snapshot.find(s => s.channelType === 'telegram')?.status).toBe('connected')
    expect(snapshot.find(s => s.channelType === 'discord')?.status).toBe('stopped')
    expect(snapshot.find(s => s.channelType === 'whatsapp')?.status).toBe('connected')

    await manager.stop()
    consoleSpy.mockRestore()
  })

  it('snapshot is isolated per call', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(
      makeConfig([{ channelType: 'telegram', accountId: 'bot1' }]),
      runner,
    )
    await manager.start()

    const snap1 = manager.getSnapshot()
    snap1[0].status = 'error'
    snap1[0].errorMessage = 'injected'

    const snap2 = manager.getSnapshot()
    expect(snap2[0].status).toBe('connected')
    expect(snap2[0].errorMessage).toBeUndefined()

    await manager.stop()
    consoleSpy.mockRestore()
  })

  it('emits connect events for each channel on start', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { reportEvent } = await import('../../../runtime/event-reporter.js')
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)

    await manager.start()

    const connectEvents = vi.mocked(reportEvent).mock.calls.filter(
      (c: any[]) => c[0].eventType === 'channel_connected'
    )
    expect(connectEvents).toHaveLength(3)

    await manager.stop()
    consoleSpy.mockRestore()
  })

  it('emits disconnect events for each channel on stop', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { reportEvent } = await import('../../../runtime/event-reporter.js')
    const manager = new NativeChannelManager(makeConfig(ALL_CHANNEL_TYPES), null, runner)

    await manager.start()
    vi.mocked(reportEvent).mockClear()

    await manager.stop()

    const disconnectEvents = vi.mocked(reportEvent).mock.calls.filter(
      (c: any[]) => c[0].eventType === 'channel_disconnected'
    )
    // Exactly one disconnect per channel — the explicit stop() emission marks
    // the entry as disconnect-emitted before aborting, so the abort listener
    // is a no-op. Operators see one signal per channel, not two.
    expect(disconnectEvents).toHaveLength(3)
    expect(disconnectEvents.every((c: any[]) => c[0].payload.reason === 'shutdown')).toBe(true)
    consoleSpy.mockRestore()
  })

  it('pause → resume → stop still emits channel_disconnected exactly once', async () => {
    // Regression: after a pause/resume cycle, the entry's `disconnectEmitted`
    // flag (set by the abort listener during pause) was not being reset on
    // resume. A subsequent stop() would then silently skip the disconnect
    // emission because the flag was still true, permanently silencing
    // lifecycle reporting for any channel that was ever paused.
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    const manager = new NativeChannelManager(
      makeConfig([{ channelType: 'telegram', accountId: 'bot1' }]),
      null,
      runner,
    )
    await manager.start()

    await manager.handleAction({ type: 'pause_channel', channelType: 'telegram', accountId: 'bot1' })
    await manager.handleAction({ type: 'resume_channel', channelType: 'telegram', accountId: 'bot1' })

    vi.mocked(reportEvent).mockClear()
    await manager.stop()

    const disconnectEvents = vi.mocked(reportEvent).mock.calls.filter(
      (c: any[]) => c[0].eventType === 'channel_disconnected'
    )
    expect(disconnectEvents).toHaveLength(1)
    expect(disconnectEvents[0][0].payload.reason).toBe('shutdown')
    consoleSpy.mockRestore()
  })

  it('handles duplicate channel config entries (same key)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const manager = new NativeChannelManager(
      makeConfig([
        { channelType: 'telegram', accountId: 'bot1' },
        { channelType: 'telegram', accountId: 'bot1' }, // Duplicate
      ]),
      runner,
    )

    await manager.start()

    // Second entry overwrites first (Map key collision)
    const snapshot = manager.getSnapshot()
    expect(snapshot).toHaveLength(1)

    await manager.stop()
    consoleSpy.mockRestore()
  })
})
