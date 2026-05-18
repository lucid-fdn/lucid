/**
 * Native channel adapter registry.
 *
 * C2a self-sovereign channels run real network adapters in-process inside a
 * dedicated runtime. Each channel type (telegram, discord, ...) ships
 * its own adapter implementing the `NativeChannelAdapter` contract below.
 *
 * The registry is intentionally explicit:
 *
 *   - Adapters MUST be registered at boot via `registerNativeChannelAdapter()`
 *     (typically alongside the worker's startup wiring).
 *   - `NativeChannelManager.start()` looks each adapter up by `channelType`
 *     and refuses to start if none is registered. There is NO silent fallback
 *     to a no-op — a missing adapter is a deployment bug, not a soft-fail.
 *
 * This contract is the boundary that lets us swap real Telegram/Discord
 * adapters in without touching the manager, and lets tests inject a mock
 * adapter to assert lifecycle behavior.
 */

export interface NativeChannelStartParams {
  /** Stable identifier for this channel instance (e.g. bot account id). */
  accountId: string
  /** Decrypted credentials for this account. Adapter is responsible for using them. */
  credentials: Record<string, string>
  /** Optional: which assistant should handle messages on this channel. */
  assistantId?: string
}

export interface NativeChannelHandlers {
  /**
   * Called by the adapter for every inbound message. The manager will route
   * the message through the agent loop and return the response text (or
   * `undefined` if the agent declined to respond).
   */
  onMessage: (
    userId: string,
    chatId: string,
    text: string,
    threadId?: string,
  ) => Promise<string | undefined>
}

export interface NativeChannelAdapter {
  /** Stable identifier — must match the `channelType` in the channel config. */
  readonly channelType: string
  /**
   * Start listening for inbound messages. Should resolve once the adapter
   * is connected (or reject with a `PermanentChannelError` for revoked
   * credentials so the manager can deactivate the channel).
   *
   * The adapter MUST honor `signal.aborted` to release sockets/timers when
   * the manager pauses or stops the channel.
   */
  start(
    params: NativeChannelStartParams,
    signal: AbortSignal,
    handlers: NativeChannelHandlers,
  ): Promise<void>
}

const REGISTRY = new Map<string, NativeChannelAdapter>()

export function registerNativeChannelAdapter(adapter: NativeChannelAdapter): void {
  // Surface accidental double-registration during boot/test wiring. Last
  // write still wins (callers may legitimately swap an adapter), but a warn
  // catches the common bug of two factories registering the same channelType.
  if (REGISTRY.has(adapter.channelType) && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[native-channels] adapter for "${adapter.channelType}" already registered — overwriting`,
    )
  }
  REGISTRY.set(adapter.channelType, adapter)
}

export function getNativeChannelAdapter(channelType: string): NativeChannelAdapter | undefined {
  return REGISTRY.get(channelType)
}

/** Test-only: clear all registered adapters between cases. */
export function __resetNativeChannelAdapters(): void {
  REGISTRY.clear()
}
