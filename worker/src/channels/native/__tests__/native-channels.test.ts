/**
 * Phase 2: NativeChannelManager lifecycle tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NativeChannelManager, type AgentRunner } from '../NativeChannelManager.js'
import {
  registerNativeChannelAdapter,
  __resetNativeChannelAdapters,
  type NativeChannelAdapter,
} from '../adapter-registry.js'
import { PermanentChannelError } from '../../errors.js'
import type { Config } from '../../../config.js'

/**
 * Build a fake adapter that records its lifecycle and lets tests:
 *   - succeed on start (default)
 *   - throw a permanent error on start
 *   - throw a transient error on start
 */
function makeFakeAdapter(opts: {
  channelType: string
  failOnStart?: 'permanent' | 'transient' | null
} = { channelType: 'telegram', failOnStart: null }): NativeChannelAdapter & {
  startCalls: number
  startArgs: Array<{ accountId: string; credentials: Record<string, string>; assistantId?: string }>
} {
  const adapter = {
    channelType: opts.channelType,
    startCalls: 0,
    startArgs: [] as Array<{ accountId: string; credentials: Record<string, string>; assistantId?: string }>,
    async start(params: { accountId: string; credentials: Record<string, string>; assistantId?: string }) {
      this.startCalls++
      this.startArgs.push(params)
      if (opts.failOnStart === 'permanent') {
        throw new PermanentChannelError('token_revoked')
      }
      if (opts.failOnStart === 'transient') {
        throw new Error('network blip')
      }
    },
  }
  return adapter
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Mock event reporter
vi.mock('../../../runtime/event-reporter.js', () => ({
  reportEvent: vi.fn(),
}))

function createMockConfig(overrides?: Partial<Config>): Config {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    LUCID_API_BASE_URL: 'http://localhost:3001',
    WORKER_ID: 'test-worker',
    INBOUND_POLL_INTERVAL: 5000,
    OUTBOUND_POLL_INTERVAL: 3000,
    CLEANUP_INTERVAL: 300000,
    SCHEDULED_TASK_POLL_INTERVAL: 30000,
    MAX_CONCURRENT_INBOUND: 5,
    MAX_CONCURRENT_OUTBOUND: 10,
    INBOUND_BATCH_SIZE: 10,
    OUTBOUND_BATCH_SIZE: 20,
    HEARTBEAT_INTERVAL: 30000,
    PORT: 3000,
    FEATURE_AGENT_RUNTIME: false,
    FEATURE_RUNTIME_V2: false,
    FEATURE_RECEIPTS: true,
    FEATURE_CONVERSATION_SUMMARY: false,
    FEATURE_TOOL_CACHE: true,
    FAST_MODEL: 'openai/gpt-4.1-mini',
    STRONG_MODEL: 'openai/gpt-4.1',
    DEDUP_TTL_HOURS: 24,
    DEFAULT_RATE_LIMIT_PER_MIN: 20,
    DEFAULT_MAX_LLM_CALLS: 15,
    DEFAULT_MAX_TOOL_CALLS: 10,
    DEFAULT_MAX_WALL_TIME_MS: 60000,
    AGENT_COMPACTION_THRESHOLD: 50,
    AGENT_KEEP_RECENT: 20,
    LLM_CALL_TIMEOUT_MS: 30000,
    LLM_RETRY_COUNT: 1,
    PII_REDACT_LOGS: true,
    NANGO_HOST: 'https://api.nango.dev',
    NANGO_ACTIONS_DIR: './nango-actions/',
    FEATURE_POLYMARKET_POSITIONS: false,
    FEATURE_POLYMARKET_AUTOMATION: false,
    FEATURE_INTROSPECTION_STREAM: false,
    FEATURE_REDIS_INGEST: false,
    FEATURE_REST_MESSAGE_RELAY: false,
    FEATURE_NATIVE_CHANNELS: true,
    LUCID_CHANNEL_CONFIG: undefined,
    OPENCLAW_CHANNEL_CONFIG: JSON.stringify([
      {
        channelType: 'telegram',
        accountId: 'bot_123',
        credentials: { bot_token: 'test-token' },
        assistantId: '44444444-4444-4444-4444-444444444444',
      },
    ]),
    LUCID_RUNTIME_GENERATION: 1,
    NODE_ENV: 'test',
    WORKER_MODE: 'all',
    ...overrides,
  } as Config
}

function createMockRunner(): AgentRunner {
  return vi.fn().mockResolvedValue({ responseText: 'Agent response' })
}

describe('NativeChannelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetNativeChannelAdapters()
    // Default: every test starts with a healthy telegram adapter registered.
    // Tests that need failure / no-adapter behavior reset and re-register.
    registerNativeChannelAdapter(makeFakeAdapter({ channelType: 'telegram', failOnStart: null }))
  })

  it('starts with configured channels', async () => {
    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    const snapshot = manager.getSnapshot()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].channelType).toBe('telegram')
    expect(snapshot[0].accountId).toBe('bot_123')
    expect(snapshot[0].status).toBe('connected')

    await manager.stop()
  })

  it('skips if no LUCID_CHANNEL_CONFIG is set', async () => {
    const config = createMockConfig({ OPENCLAW_CHANNEL_CONFIG: undefined, LUCID_CHANNEL_CONFIG: undefined })
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    expect(manager.getSnapshot()).toHaveLength(0)
  })

  it('allows Hermes to use the shared runtime-native channel adapters', async () => {
    const config = createMockConfig({ LUCID_ENGINE: 'hermes' as const })
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    const snapshot = manager.getSnapshot()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].status).toBe('connected')
  })

  it('handles invalid JSON config gracefully', async () => {
    const config = createMockConfig({ OPENCLAW_CHANNEL_CONFIG: 'not-json', LUCID_CHANNEL_CONFIG: undefined })
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    expect(manager.getSnapshot()).toHaveLength(0)
  })

  it('prefers engine-agnostic LUCID_CHANNEL_CONFIG over the legacy alias', async () => {
    const config = createMockConfig({
      LUCID_CHANNEL_CONFIG: JSON.stringify([
        {
          channelType: 'telegram',
          accountId: 'bot_999',
          credentials: { bot_token: 'new-token' },
          assistantId: '44444444-4444-4444-4444-444444444444',
        },
      ]),
      OPENCLAW_CHANNEL_CONFIG: JSON.stringify([
        {
          channelType: 'telegram',
          accountId: 'bot_123',
          credentials: { bot_token: 'old-token' },
          assistantId: '44444444-4444-4444-4444-444444444444',
        },
      ]),
    })
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    const snapshot = manager.getSnapshot()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].accountId).toBe('bot_999')
  })

  it('stops all channels on stop()', async () => {
    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()
    expect(manager.getSnapshot()).toHaveLength(1)

    await manager.stop()
    expect(manager.getSnapshot()).toHaveLength(0)
  })

  it('handles pause_channel governance action', async () => {
    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    await manager.handleAction({
      type: 'pause_channel',
      channelType: 'telegram',
      accountId: 'bot_123',
    })

    const snapshot = manager.getSnapshot()
    expect(snapshot[0].status).toBe('stopped')
  })

  it('handles resume_channel governance action', async () => {
    __resetNativeChannelAdapters()
    const adapter = makeFakeAdapter({ channelType: 'telegram', failOnStart: null })
    registerNativeChannelAdapter(adapter)

    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    // Pause then resume
    await manager.handleAction({ type: 'pause_channel', channelType: 'telegram', accountId: 'bot_123' })
    await manager.handleAction({ type: 'resume_channel', channelType: 'telegram', accountId: 'bot_123' })

    const snapshot = manager.getSnapshot()
    expect(snapshot[0].status).toBe('connected')
    expect(adapter.startCalls).toBe(2)
    expect(adapter.startArgs[1]).toEqual({
      accountId: 'bot_123',
      credentials: { bot_token: 'test-token' },
      assistantId: '44444444-4444-4444-4444-444444444444',
    })
  })

  it('handles stop_all_channels governance action', async () => {
    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()
    await manager.handleAction({ type: 'stop_all_channels' })

    expect(manager.getSnapshot()).toHaveLength(0)
  })

  it('reports channel_connected event via bridge', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')
    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()

    expect(vi.mocked(reportEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'channel_connected',
        payload: expect.objectContaining({
          channel: 'telegram',
          accountId: 'bot_123',
        }),
      })
    )

    await manager.stop()
  })

  it('refuses to mark a channel connected when no adapter is registered', async () => {
    __resetNativeChannelAdapters() // wipe the default telegram adapter
    const config = createMockConfig()
    const manager = new NativeChannelManager(config, createMockRunner())

    await manager.start()

    const snapshot = manager.getSnapshot()
    // Critical: status MUST be 'error', not 'connected'. The previous no-op
    // implementation reported 'connected' here while ignoring every message.
    expect(snapshot[0].status).toBe('error')
    expect(snapshot[0].errorMessage).toContain('No native channel adapter registered')
  })

  it('marks the channel error and phones home on permanent adapter failure', async () => {
    __resetNativeChannelAdapters()
    registerNativeChannelAdapter(makeFakeAdapter({ channelType: 'telegram', failOnStart: 'permanent' }))

    const { reportEvent } = await import('../../../runtime/event-reporter.js')

    const config = createMockConfig()
    const manager = new NativeChannelManager(config, createMockRunner())

    await manager.start()

    const snapshot = manager.getSnapshot()
    expect(snapshot[0].status).toBe('error')
    expect(snapshot[0].errorMessage).toContain('token_revoked')

    // Phone home — operator must see this exactly once via the shared reporter.
    expect(vi.mocked(reportEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'channel_deactivated',
        severity: 'critical',
        payload: expect.objectContaining({ channel: 'telegram', accountId: 'bot_123' }),
      }),
    )
    expect(
      vi.mocked(reportEvent).mock.calls.filter(
        ([event]) => event.eventType === 'channel_deactivated',
      ),
    ).toHaveLength(1)
    // Permanent-failure path must NOT also emit a transient `error` event —
    // operator should see one critical signal, not two competing ones.
    expect(
      vi.mocked(reportEvent).mock.calls.filter(([event]) => event.eventType === 'error'),
    ).toHaveLength(0)
  })

  it('does not call adapter.start a second time on a transient failure', async () => {
    __resetNativeChannelAdapters()
    const adapter = makeFakeAdapter({ channelType: 'telegram', failOnStart: 'transient' })
    registerNativeChannelAdapter(adapter)

    const config = createMockConfig()
    const manager = new NativeChannelManager(config, createMockRunner())

    await manager.start()

    expect(adapter.startCalls).toBe(1)
    expect(manager.getSnapshot()[0].status).toBe('error')
  })

  it('reports channel_disconnected event on stop', async () => {
    const { reportEvent } = await import('../../../runtime/event-reporter.js')
    const config = createMockConfig()
    const runner = createMockRunner()
    const manager = new NativeChannelManager(config, runner)

    await manager.start()
    vi.mocked(reportEvent).mockClear()

    await manager.stop()

    expect(vi.mocked(reportEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'channel_disconnected',
        payload: expect.objectContaining({
          channel: 'telegram',
          reason: 'shutdown',
        }),
      })
    )
  })

  it('does not emit channel_connected if stop wins the race during adapter startup', async () => {
    __resetNativeChannelAdapters()
    const startGate = deferred<void>()
    registerNativeChannelAdapter({
      channelType: 'telegram',
      async start() {
        await startGate.promise
      },
    })

    const { reportEvent } = await import('../../../runtime/event-reporter.js')
    const manager = new NativeChannelManager(createMockConfig(), createMockRunner())

    const startPromise = manager.start()
    await Promise.resolve()
    await manager.stop()

    vi.mocked(reportEvent).mockClear()
    startGate.resolve()
    await startPromise

    expect(
      vi.mocked(reportEvent).mock.calls.filter(
        ([event]) =>
          event.eventType === 'channel_connected' &&
          event.payload.channel === 'telegram' &&
          event.payload.accountId === 'bot_123',
      ),
    ).toHaveLength(0)
    expect(manager.getSnapshot()).toHaveLength(0)
  })
})
