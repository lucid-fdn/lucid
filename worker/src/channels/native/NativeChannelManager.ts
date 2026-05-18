/**
 * NativeChannelManager — C2a Self-Sovereign Channel Runtime
 *
 * Manages runtime-native channel adapters running in-process on dedicated runtimes.
 * Messages flow entirely in-process. Control plane sees everything via ControlPlaneBridge.
 *
 * Lifecycle:
 *   start() → load config → initialize adapters → wire inbound → wire status
 *   stop()  → abort all adapters → flush events → cleanup
 *
 * Inbound flow (direct, no DB outbox):
 *   1. Channel adapter receives message (Discord WebSocket, Telegram update, etc.)
 *   2. Runtime-native transport normalizes to standard shape
 *   3. bridge.onMessageReceived() — mirrors to control plane
 *   4. agentRunner() — calls same agent loop
 *   5. Outbound adapter delivers response directly (C2a owns bot tokens)
 *   6. bridge.onMessageSent() — mirrors to control plane
 */

import type { NativeChannelStatus } from '../../runtime/data-sink.js'
import type { Config } from '../../config.js'
import { ControlPlaneBridge } from './ControlPlaneBridge.js'
import {
  assertRuntimeNativeTransportSupport,
  getRuntimeNativeTransport,
} from '../runtime-native/contracts.js'
import { isPermanentChannelFailure } from '../errors.js'

export type AgentRunner = (params: {
  assistantId: string
  channelType: string
  userId: string
  chatId: string
  messageText: string
  threadId?: string
}) => Promise<{ responseText: string; toolCalls?: unknown[] }>

export interface GovernanceAction {
  type: 'pause_channel' | 'resume_channel' | 'stop_all_channels'
  channelType?: string
  accountId?: string
}

interface ChannelEntry {
  status: NativeChannelStatus
  abort: AbortController
  deactivated: boolean
  /**
   * Set true the first time we emit a `channel_disconnected` event for this
   * entry. The abort listener and the explicit `stop()`/`pause` paths both
   * try to emit — without this flag the operator sees two disconnect signals
   * for every shutdown. First write wins.
   */
  disconnectEmitted: boolean
  config: {
    channelType: string
    accountId: string
    credentials: Record<string, string>
    assistantId?: string
  }
}

export class NativeChannelManager {
  private bridge: ControlPlaneBridge
  private channels: Map<string, ChannelEntry> = new Map()
  /**
   * Per-channel-key serialization. Without this, two concurrent
   * `resume_channel` actions for the same key (e.g. an operator clicking
   * twice, or a heartbeat-driven reconnect racing with a manual resume)
   * could both create new AbortControllers and start two adapters in
   * parallel — leaking sockets and corrupting status. We chain the next
   * start onto the previous one and abort the superseded controller before
   * swapping it in.
   */
  private channelMutex: Map<string, Promise<unknown>> = new Map()

  /** Serialize start/resume/pause for a single channel key. */
  private async withChannelLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.channelMutex.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn) // run fn whether prev resolved or rejected
    this.channelMutex.set(key, next.catch(() => undefined))
    return next
  }

  constructor(
    private readonly config: Config,
    private readonly agentRunner: AgentRunner,
  ) {
    this.bridge = new ControlPlaneBridge()
  }

  private getChannelConfigJson(): string | undefined {
    return this.config.LUCID_CHANNEL_CONFIG ?? this.config.OPENCLAW_CHANNEL_CONFIG
  }

  /**
   * Start native channel adapters from config.
   * Reads LUCID_CHANNEL_CONFIG (or legacy OPENCLAW_CHANNEL_CONFIG) JSON for channel definitions.
   */
  async start(): Promise<void> {
    assertRuntimeNativeTransportSupport(this.config.LUCID_ENGINE)

    const configJson = this.getChannelConfigJson()
    if (!configJson) {
      console.log('[native-channels] No LUCID_CHANNEL_CONFIG set — skipping')
      return
    }

    let channelConfigs: Array<{
      channelType: string
      accountId: string
      credentials: Record<string, string>
      assistantId?: string
    }>

    try {
      channelConfigs = JSON.parse(configJson)
    } catch {
      console.error('[native-channels] Invalid LUCID_CHANNEL_CONFIG JSON')
      return
    }

    if (!Array.isArray(channelConfigs) || channelConfigs.length === 0) {
      console.log('[native-channels] No channels configured')
      return
    }

    // Reject duplicate (channelType, accountId) entries up front. The Map
    // below would silently overwrite on key collision, leaking the first
    // channel's AbortController and creating a hidden second adapter for
    // operators to debug. Loud is better than quiet.
    const seen = new Set<string>()
    const dedupedConfigs: typeof channelConfigs = []
    for (const c of channelConfigs) {
      const k = `${c.channelType}:${c.accountId}`
      if (seen.has(k)) {
        console.error(`[native-channels] Duplicate channel config "${k}" — keeping first, dropping later entry`)
        continue
      }
      seen.add(k)
      dedupedConfigs.push(c)
    }
    channelConfigs = dedupedConfigs

    console.log(`[native-channels] Starting ${channelConfigs.length} channel adapters`)

    for (const channelConfig of channelConfigs) {
      const key = `${channelConfig.channelType}:${channelConfig.accountId}`
      const abort = new AbortController()

      const status: NativeChannelStatus = {
        channelType: channelConfig.channelType,
        accountId: channelConfig.accountId,
        status: 'reconnecting',
      }

      this.channels.set(key, { status, abort, deactivated: false, disconnectEmitted: false, config: channelConfig })

      // Start the channel adapter
      try {
        await this.startChannelAdapter(channelConfig, abort.signal)
        const activeEntry = this.channels.get(key)
        if (!activeEntry || activeEntry.abort.signal !== abort.signal || abort.signal.aborted) {
          console.log(`[native-channels] Skipping stale connected transition for ${key}`)
          continue
        }

        activeEntry.status.status = 'connected'
        this.bridge.onChannelConnected(channelConfig.channelType, channelConfig.accountId)
        console.log(`[native-channels] ✅ ${key} connected`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        status.status = 'error'
        status.errorMessage = errorMsg
        // If startChannelAdapter already emitted a `channel_deactivated` event
        // (permanent failure path), suppress the redundant transient `error`
        // event so the operator sees one critical signal instead of two.
        const entry = this.channels.get(key)
        if (!entry?.deactivated) {
          this.bridge.onChannelError(channelConfig.channelType, channelConfig.accountId, errorMsg)
        }
        console.error(`[native-channels] ❌ ${key} failed to start:`, errorMsg)
      }
    }
  }

  /**
   * Start a single channel adapter via the adapter registry.
   *
   * Resolution rules:
   *   1. Look up the adapter by `channelType` in the global registry.
   *   2. If no adapter is registered → throw. This is a deployment bug,
   *      not a soft-fail. Silently no-op'ing here (the previous behavior)
   *      meant the runtime reported "connected" while ignoring every
   *      message — the worst possible failure mode.
   *   3. Call `adapter.start()` with a wired inbound handler. If start
   *      throws a permanent error, mark the channel deactivated and
   *      phone home so the operator can rotate credentials.
   */
  private async startChannelAdapter(
    channelConfig: {
      channelType: string
      accountId: string
      credentials: Record<string, string>
      assistantId?: string
    },
    signal: AbortSignal,
  ): Promise<void> {
    const key = `${channelConfig.channelType}:${channelConfig.accountId}`
    const entry = this.channels.get(key)

    const adapter = getRuntimeNativeTransport(channelConfig.channelType)
    if (!adapter) {
      throw new Error(
        `No native channel adapter registered for type "${channelConfig.channelType}". ` +
        `Register one via registerNativeChannelAdapter() during worker startup.`,
      )
    }

    // Wire inbound message handler — adapters call this for every received
    // message and forward our return value as the outbound reply text.
    const onMessage = async (
      userId: string,
      chatId: string,
      text: string,
      threadId?: string,
    ): Promise<string | undefined> => {
      if (signal.aborted) return undefined

      this.bridge.onMessageReceived(channelConfig.channelType, channelConfig.accountId, userId, text)

      if (entry) {
        entry.status.lastMessageAt = new Date().toISOString()
      }

      try {
        const result = await this.agentRunner({
          assistantId: channelConfig.assistantId || '',
          channelType: channelConfig.channelType,
          userId,
          chatId,
          messageText: text,
          threadId,
        })

        this.bridge.onMessageSent(channelConfig.channelType, channelConfig.accountId, userId)
        return result.responseText
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        this.bridge.onChannelError(channelConfig.channelType, channelConfig.accountId, errorMsg)
        throw err
      }
    }

    try {
      await adapter.start(
        {
          accountId: channelConfig.accountId,
          credentials: channelConfig.credentials,
          assistantId: channelConfig.assistantId,
        },
        signal,
        { onMessage },
      )
    } catch (err) {
      // Permanent failures (revoked tokens, suspended accounts) must NOT be
      // retried — instead we deactivate the channel and surface a critical
      // event so the operator rotates credentials.
      if (isPermanentChannelFailure(err)) {
        const reason = err instanceof Error ? err.message : String(err)
        if (entry) {
          entry.status.status = 'error'
          entry.status.errorMessage = reason
        }
        // Use the shared event-reporter path so dedicated runtimes emit the
        // same single durable event shape as every other native-channel event.
        // Calling DataSink.reportEvents() here as well double-reports the same
        // deactivation once the reporter flushes.
        this.emitChannelDeactivated(key, reason)
      }
      throw err
    }

    // Track abort for cleanup. The abort listener is the disconnect path for
    // pause (which only calls abort()). For explicit stop() the disconnect
    // event is emitted up front and `disconnectEmitted` is set, so the
    // listener becomes a no-op — first emitter wins.
    signal.addEventListener('abort', () => {
      if (entry) {
        entry.status.status = 'stopped'
        if (entry.disconnectEmitted) return
        entry.disconnectEmitted = true
      }
      this.bridge.onChannelDisconnected(channelConfig.channelType, channelConfig.accountId, 'aborted')
    }, { once: true })
  }

  /**
   * Stop all channel adapters gracefully.
   */
  async stop(): Promise<void> {
    console.log(`[native-channels] Stopping ${this.channels.size} adapters`)

    for (const [, entry] of this.channels) {
      // Mark the disconnect emitted BEFORE calling abort() so the abort
      // listener becomes a no-op and operators see exactly one
      // `channel_disconnected` per shutdown (with reason 'shutdown', not
      // 'aborted').
      entry.status.status = 'stopped'
      if (!entry.disconnectEmitted) {
        entry.disconnectEmitted = true
        this.bridge.onChannelDisconnected(
          entry.status.channelType,
          entry.status.accountId,
          'shutdown',
        )
      }
      entry.abort.abort()
    }

    this.channels.clear()
    console.log('[native-channels] All adapters stopped')
  }

  /**
   * Get current snapshot of all native channel statuses (for heartbeat reporting).
   */
  getSnapshot(): NativeChannelStatus[] {
    return Array.from(this.channels.values()).map(c => ({ ...c.status }))
  }

  /**
   * Handle governance actions from the control plane (via heartbeat response).
   */
  async handleAction(action: GovernanceAction): Promise<void> {
    switch (action.type) {
      case 'pause_channel': {
        if (!action.channelType || !action.accountId) return
        const key = `${action.channelType}:${action.accountId}`
        // Serialize against any in-flight resume on the same key. Otherwise
        // a pause that races with a concurrent resume could abort the
        // controller before the resume even installs the new one, leaving
        // the channel running with a stale "stopped" status.
        await this.withChannelLock(key, async () => {
          const entry = this.channels.get(key)
          if (entry) {
            entry.abort.abort()
            entry.status.status = 'stopped'
            console.log(`[native-channels] Paused ${key}`)
          }
        })
        break
      }
      case 'resume_channel': {
        if (!action.channelType || !action.accountId) return
        const key = `${action.channelType}:${action.accountId}`
        // Serialize per key. If two resume_channel actions race, the second
        // waits for the first to finish before starting — preventing two
        // live adapters bound to the same key.
        await this.withChannelLock(key, async () => {
          const entry = this.channels.get(key)
          if (!entry) return

          // Abort any prior controller before swapping. Without this, a
          // superseded start() left over from a stale claim could keep
          // running and leak sockets — even though the status update
          // path correctly skips stale transitions, the abort signal
          // is the only thing the adapter listens to for shutdown.
          try { entry.abort.abort() } catch { /* ignore */ }

          const newAbort = new AbortController()
          entry.abort = newAbort
          entry.deactivated = false
          entry.disconnectEmitted = false
          entry.status.status = 'reconnecting'
          entry.status.errorMessage = undefined
          try {
            await this.startChannelAdapter(entry.config, newAbort.signal)
            const activeEntry = this.channels.get(key)
            if (!activeEntry || activeEntry.abort.signal !== newAbort.signal || newAbort.signal.aborted) {
              console.log(`[native-channels] Skipping stale resume transition for ${key}`)
              return
            }

            activeEntry.status.status = 'connected'
            this.bridge.onChannelConnected(action.channelType!, action.accountId!)
            console.log(`[native-channels] Resumed ${key}`)
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            entry.status.status = 'error'
            entry.status.errorMessage = errorMsg
            // Same dedup as the start() path: if startChannelAdapter already
            // emitted `channel_deactivated` (permanent failure on resume),
            // suppress the redundant transient `error` event so the operator
            // sees one critical signal instead of two.
            const refreshed = this.channels.get(key)
            if (!refreshed?.deactivated) {
              this.bridge.onChannelError(action.channelType!, action.accountId!, errorMsg)
            }
            console.error(`[native-channels] Resume failed for ${key}: ${errorMsg}`)
          }
        })
        break
      }
      case 'stop_all_channels': {
        await this.stop()
        break
      }
    }
  }

  private emitChannelDeactivated(key: string, reason: string): void {
    const entry = this.channels.get(key)
    if (!entry || entry.deactivated) return

    entry.deactivated = true
    this.bridge.onChannelDeactivated(entry.config.channelType, entry.config.accountId, reason)
  }
}
