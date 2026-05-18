/**
 * ChannelAdapter bridges OpenClaw outbound plugins to our ChannelOutput lifecycle.
 *
 * Full architecture, invariants, and test matrix are centralized in:
 * docs/CHANNEL_ADAPTER_ARCHITECTURE.md
 */

import type { Config } from '../config.js'
import type { ChannelOutput, ChannelOutputConfig, MessageRef } from './ChannelOutput.js'
import { DEFAULT_FLUSH_INTERVAL_MS, MIN_BUFFER_SIZE } from './ChannelOutput.js'
import { cleanupVoiceTempFile, prepareVoiceReplyMedia } from '../processors/voice-replies.js'

/* ─── OpenClaw Extension Outbound Interface ─────────────── */

/**
 * Result from an OpenClaw outbound send operation.
 * Maps to what OpenClaw extensions return from sendText/sendMedia.
 */
export interface OutboundResult {
  channel: string
  messageId?: string | number
  chatId?: string
  ok?: boolean
  error?: string
}

/**
 * Parameters for OpenClaw outbound text delivery.
 */
export interface OutboundSendParams {
  /** Target chat/channel ID */
  to: string
  /** Text to send */
  text: string
  /** Account ID (for multi-account channels) */
  accountId?: string
  /** Reply-to message ID (platform-specific) */
  replyToId?: string
  /** Thread ID for threaded channels */
  threadId?: string
  /** Optional dependencies (injected for testing) */
  deps?: Record<string, unknown>
  /** Optional platform-specific transport options */
  platformOptions?: Record<string, unknown>
}

/**
 * The subset of OpenClaw's ChannelPlugin.outbound that we actually use.
 * This is the contract that any OpenClaw extension must satisfy to be bridged.
 *
 * From OpenClaw's perspective, each extension provides this in its plugin definition.
 * We extract just the delivery mechanics we need.
 */
export interface OpenClawOutbound {
  /** How delivery works: 'direct' = send-and-forget, 'streamed' = supports edits */
  deliveryMode: 'direct' | 'streamed'

  /**
   * Markdown-aware text chunker.
   * Splits text respecting formatting boundaries (code blocks, lists, etc.)
   * OpenClaw extensions provide this — it's better than our simple chunkText().
   */
  chunker: (text: string, limit: number) => string[]

  /** Chunking mode: 'markdown' preserves formatting, 'plain' = raw text */
  chunkerMode: 'markdown' | 'plain'

  /** Max text chunk size for this channel (e.g., Telegram=4000, Discord=2000) */
  textChunkLimit: number

  /** Send a text message. Returns result with messageId for edits. */
  sendText: (params: OutboundSendParams) => Promise<OutboundResult>

  /** Optional: Send media (image, file, etc.) */
  sendMedia?: (params: OutboundSendParams & { mediaUrl: string }) => Promise<OutboundResult>

  /** Optional: Edit an existing message (for streaming UX) */
  editText?: (params: OutboundSendParams & { messageId: string }) => Promise<OutboundResult>

  /** Optional: Start a Slack-native text stream */
  startNativeStream?: (params: OutboundSendParams & {
    recipientTeamId?: string
    recipientUserId?: string
  }) => Promise<OutboundResult & { streamId?: string }>

  /** Optional: Append to an active Slack-native text stream */
  appendNativeStream?: (params: { streamId: string; text: string }) => Promise<OutboundResult>

  /** Optional: Finalize an active Slack-native text stream */
  stopNativeStream?: (params: { streamId: string; text?: string }) => Promise<OutboundResult>

  /** Optional: Set a Slack assistant thread status */
  setNativeStatus?: (params: {
    channel: string
    threadTs: string
    status: string
  }) => Promise<OutboundResult>
}

/* ─── Streaming Support Detection ─────────────── */

/**
 * Channels that support "streaming UX" (placeholder → edits → final).
 * Others get non-streaming delivery (chunked send on finalize).
 */
export interface StreamingConfig {
  /** Whether this channel supports message editing for streaming UX */
  supportsEditing: boolean
  /** Flush interval for streaming edits (ms) */
  flushIntervalMs?: number
  /** Minimum buffer size before flushing */
  minBufferSize?: number
  /** Cursor indicator appended during streaming (e.g., ' ▍') */
  cursorIndicator?: string
}

/* ─── Channel Registration ─────────────── */

/**
 * Complete channel registration entry.
 * Each supported channel registers one of these.
 */
export interface ChannelRegistration {
  /** Channel type identifier (matches DB channel_type) */
  channelType: string
  /** OpenClaw extension outbound interface */
  outbound: OpenClawOutbound
  /** Streaming configuration */
  streaming: StreamingConfig
}

/* ─── The Adapter ─────────────── */

/**
 * OpenClawChannelAdapter — Implements our ChannelOutput lifecycle
 * using an OpenClaw extension's delivery mechanics.
 *
 * Usage:
 * ```typescript
 * const adapter = new OpenClawChannelAdapter(
 *   telegramOutbound,           // from OpenClaw telegram extension
 *   { supportsEditing: true },  // streaming config
 *   channelOutputConfig,        // our standard config
 * )
 *
 * // Used exactly like TelegramOutput:
 * await adapter.begin()
 * await adapter.append('Hello')
 * await adapter.finalize('Hello, world!')
 * ```
 */
export class OpenClawChannelAdapter implements ChannelOutput {
  private static readonly TELEGRAM_MIN_INITIAL_STREAM_CHARS = 30

  private outbound: OpenClawOutbound
  private streaming: StreamingConfig
  private config: ChannelOutputConfig

  // Streaming state
  private ref: MessageRef | null = null
  private buffer = ''
  private lastFlushed = ''
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private flushing = false
  private closed = false
  private finalizing = false
  private finalized = false
  private statusPreviewActive = false
  private streamingActive = false
  private flushInFlight: Promise<void> | null = null
  private nativeStreamRef: { streamId: string } | null = null
  private typingTimer: ReturnType<typeof setInterval> | null = null
  private baseFlushIntervalMs: number
  private currentFlushIntervalMs: number
  private consecutiveRateLimitFailures = 0
  private backoffUntil = 0
  private readonly opTimeoutMs = 2000
  private readonly finalizeOpTimeoutMs = 8000
  private readonly flushEditTimeoutMs = 1500

  constructor(
    outbound: OpenClawOutbound,
    streaming: StreamingConfig,
    config: ChannelOutputConfig,
  ) {
    this.outbound = outbound
    this.streaming = streaming
    this.config = config
    this.baseFlushIntervalMs = this.streaming.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.currentFlushIntervalMs = this.baseFlushIntervalMs
  }

  private get canStream(): boolean {
    if (this.streamingMode === 'off') {
      return false
    }
    if (this.canUseSlackNativeStreaming) {
      return true
    }
    if (this.streamingMode === 'block') {
      return true
    }
    return (
      // Policy A: markdown-mode channels finalize with markdown-aware chunking only
      // (avoid broken partial markdown while streaming edits)
      this.outbound.chunkerMode !== 'markdown' &&
      this.streaming.supportsEditing &&
      this.outbound.deliveryMode === 'streamed' &&
      !!this.outbound.editText
    )
  }

  private get streamingMode(): 'off' | 'partial' | 'block' | 'progress' {
    if (this.config.channelType === 'slack') {
      return this.config.slackStreamingMode ?? 'partial'
    }
    if (this.config.channelType === 'discord') {
      return this.config.discordStreamingMode ?? 'partial'
    }
    return 'partial'
  }

  private get canUseSlackNativeStreaming(): boolean {
    return (
      this.config.channelType === 'slack' &&
      this.streamingMode === 'partial' &&
      this.config.slackNativeStreaming === true &&
      typeof this.config.threadId === 'string' &&
      this.config.threadId.length > 0 &&
      typeof this.outbound.startNativeStream === 'function' &&
      typeof this.outbound.appendNativeStream === 'function' &&
      typeof this.outbound.stopNativeStream === 'function'
    )
  }

  private get canUseSlackNativeStatus(): boolean {
    return (
      this.config.channelType === 'slack' &&
      this.config.slackNativeStreaming === true &&
      typeof this.config.threadId === 'string' &&
      this.config.threadId.length > 0 &&
      typeof this.outbound.setNativeStatus === 'function'
    )
  }

  private get shouldSendDiscordTyping(): boolean {
    return this.config.channelType === 'discord' && this.config.discordTypingFeedback === true
  }

  private baseParams(text: string): OutboundSendParams {
    return this.buildParams(text)
  }

  private resolveTargetAddress(chatId: string): string {
    if (this.config.channelType !== 'discord') return chatId
    if (
      chatId.startsWith('channel:') ||
      chatId.startsWith('user:') ||
      chatId.startsWith('discord:')
    ) {
      return chatId
    }
    return `channel:${chatId}`
  }

  private resolveEditAddress(chatId: string): string {
    if (this.config.channelType !== 'discord') return chatId
    if (chatId.startsWith('channel:')) return chatId.slice('channel:'.length)
    if (chatId.startsWith('discord:')) return chatId.slice('discord:'.length)
    return chatId
  }

  private shouldIncludeReplyReference(chunkIndex: number): boolean {
    switch (this.config.replyToMode) {
      case 'off':
        return false
      case 'first':
        return chunkIndex === 0
      default:
        return true
    }
  }

  private async sendDiscordTypingIndicator(): Promise<void> {
    if (!this.shouldSendDiscordTyping) return
    const channelId = this.resolveEditAddress(this.config.chatId)
    try {
      await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/typing`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.config.botToken}`,
        },
      })
    } catch {
      // Best-effort UX signal only.
    }
  }

  private startTypingTimer(): void {
    if (!this.shouldSendDiscordTyping || this.typingTimer) return
    void this.sendDiscordTypingIndicator()
    this.typingTimer = setInterval(() => {
      if (this.closed || this.finalizing || this.finalized) return
      void this.sendDiscordTypingIndicator()
    }, 8000)
  }

  private stopTypingTimer(): void {
    if (!this.typingTimer) return
    clearInterval(this.typingTimer)
    this.typingTimer = null
  }

  private buildParams(
    text: string,
    platformOptions?: Record<string, unknown>,
    options?: { includeReplyTo?: boolean },
  ): OutboundSendParams {
    const includeReplyTo = options?.includeReplyTo !== false
    return {
      to: this.resolveTargetAddress(this.config.chatId),
      text,
      accountId: this.config.accountId,
      threadId: this.config.threadId,
      deps: this.config.deps,
      replyToId: includeReplyTo ? this.config.replyToMessageId : undefined,
      ...(platformOptions ? { platformOptions } : {}),
    }
  }

  private formatSafeError(err: unknown): string {
    if (!err) return 'unknown_error'
    if (err instanceof Error) {
      return `${err.name}:${err.message}`.slice(0, 180)
    }
    return String(err).slice(0, 180)
  }

  private truncateStreamingPreview(text: string, withCursor = false): string {
    if (this.streamingMode === 'progress') {
      const charCount = Array.from(text).length
      const wordCount = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0
      const status = `Lucid is thinking… ${wordCount > 0 ? `${wordCount} words` : `${charCount} chars`} so far`
      return withCursor ? `${status} ▍` : status
    }
    const cursor = withCursor ? (this.streaming.cursorIndicator ?? ' ▍') : ''
    const previewLimit = this.outbound.textChunkLimit
    const graphemes = Array.from(text)
    const cursorLength = Array.from(cursor).length

    if (graphemes.length + cursorLength <= previewLimit) {
      return withCursor ? `${text}${cursor}` : text
    }

    const suffix = withCursor ? `…${cursor}` : '…'
    const suffixLength = Array.from(suffix).length
    const visibleBudget = Math.max(1, previewLimit - suffixLength)
    return `${graphemes.slice(0, visibleBudget).join('')}${suffix}`
  }

  private truncateStatusPreview(text: string): string {
    const cursor = this.streaming.cursorIndicator ?? ' ▍'
    const previewLimit = this.outbound.textChunkLimit
    const graphemes = Array.from(text)
    const cursorLength = Array.from(cursor).length

    if (graphemes.length + cursorLength <= previewLimit) {
      return `${text}${cursor}`
    }

    const suffix = `…${cursor}`
    const suffixLength = Array.from(suffix).length
    const visibleBudget = Math.max(1, previewLimit - suffixLength)
    return `${graphemes.slice(0, visibleBudget).join('')}${suffix}`
  }

  private formatSlackNativeStatus(label: string): string {
    const trimmed = label.trim()
    if (!trimmed) return ''
    const lower = `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`
    if (/^(?:is|are|has|will|can|needs|waiting|checking|reading|writing|loading|preparing)\b/i.test(trimmed)) {
      return lower.startsWith('is ') ? lower : `is ${lower}`
    }
    return `is ${lower}`
  }

  private assertOk(result: OutboundResult, op: string): void {
    if (result.ok === false) {
      throw new Error(`${op} failed: ${result.error ?? 'unknown'}`)
    }
  }

  private get runtimeConfig(): Config | null {
    const deps = this.config.deps as { runtimeConfig?: Config } | undefined
    return deps?.runtimeConfig ?? null
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (err) => {
          clearTimeout(timer)
          reject(err)
        },
      )
    })
  }

  private async sendChunks(
    chunks: string[],
    timeoutMs = this.opTimeoutMs,
    finalPlatformOptions?: Record<string, unknown>,
  ): Promise<void> {
    for (const [index, chunk] of chunks.entries()) {
      const result = await this.withTimeout(
        this.outbound.sendText(
          index === 0 && finalPlatformOptions
            ? this.buildParams(chunk, finalPlatformOptions, {
                includeReplyTo: this.shouldIncludeReplyReference(index),
              })
            : this.buildParams(chunk, undefined, {
                includeReplyTo: this.shouldIncludeReplyReference(index),
              }),
        ),
        timeoutMs,
        'sendText',
      )
      this.assertOk(result, 'sendText')
    }
  }

  private waitForFlushInFlight(): Promise<void> {
    return this.flushInFlight ?? Promise.resolve()
  }

  private startFlushTimer(intervalMs = this.baseFlushIntervalMs): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.currentFlushIntervalMs = intervalMs
    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.currentFlushIntervalMs)
  }

  private isRateLimitError(err: unknown): boolean {
    if (!(err instanceof Error)) return false
    return err.message.includes('429') || /rate.?limit/i.test(err.message)
  }

  private applyRateLimitBackoff(): void {
    this.consecutiveRateLimitFailures += 1
    const maxBackoffMs = 8000
    const nextInterval = Math.min(
      maxBackoffMs,
      this.baseFlushIntervalMs * Math.pow(2, this.consecutiveRateLimitFailures)
    )
    this.backoffUntil = Date.now() + nextInterval
    this.startFlushTimer(nextInterval)
  }

  private resetBackoffAfterSuccess(): void {
    if (this.consecutiveRateLimitFailures === 0 && this.currentFlushIntervalMs === this.baseFlushIntervalMs) {
      return
    }
    this.consecutiveRateLimitFailures = 0
    this.backoffUntil = 0
    this.startFlushTimer(this.baseFlushIntervalMs)
  }

  /* ─── ChannelOutput Lifecycle ─────────────── */

  async begin(): Promise<MessageRef | null> {
    if (!this.canStream) {
      // Non-streaming channels: no placeholder needed
      this.streamingActive = false
      return null
    }

    try {
      // Discord and Slack edit-stream paths should show an immediate visible
      // placeholder so short replies don't collapse into "final only" UX.
      if (
        (this.config.channelType === 'discord' && this.streamingMode !== 'block') ||
        (this.config.channelType === 'slack' && !this.canUseSlackNativeStreaming)
      ) {
        const placeholder = 'Lucid is thinking…'
        const result = await this.withTimeout(
          this.outbound.sendText(
            this.buildParams(placeholder, undefined, {
              includeReplyTo: this.shouldIncludeReplyReference(0),
            }),
          ),
          this.opTimeoutMs,
          'sendText',
        )
        this.assertOk(result, 'sendText')
        if (result.messageId) {
          this.ref = {
            messageId: String(result.messageId),
            chatId: result.chatId ? String(result.chatId) : this.config.chatId,
          }
        }
      }

      // Other streamed channels can wait until enough real text accumulates
      // before creating the preview message.
      this.streamingActive = true
      this.startTypingTimer()
      this.startFlushTimer(this.baseFlushIntervalMs)
      return this.ref
    } catch (err) {
      this.streamingActive = false
      console.error(
        `[channel-adapter:${this.config.channelType}] begin() failed: ${this.formatSafeError(err)}`,
      )
      return null
    }
  }

  async append(delta: string): Promise<void> {
    if (this.closed) return
    if (!this.streamingActive) return
    if (this.statusPreviewActive) {
      this.buffer = ''
      this.lastFlushed = ''
      this.statusPreviewActive = false
    }
    this.buffer += delta
    if (
      this.config.channelType === 'discord' &&
      this.ref &&
      this.lastFlushed.length === 0 &&
      !this.flushing
    ) {
      void this.flush()
    }
    // Flush is handled by the interval timer — non-blocking
  }

  async status(label: string): Promise<void> {
    if (this.closed || this.finalizing || this.finalized) return
    if (!label.trim()) return
    if (this.canUseSlackNativeStatus && this.outbound.setNativeStatus) {
      try {
        const result = await this.withTimeout(
          this.outbound.setNativeStatus({
            channel: this.config.chatId,
            threadTs: this.config.threadId!,
            status: this.formatSlackNativeStatus(label),
          }),
          this.opTimeoutMs,
          'setNativeStatus',
        )
        this.assertOk(result, 'setNativeStatus')
      } catch (err) {
        console.warn(
          `[channel-adapter:${this.config.channelType}] native status() failed: ${this.formatSafeError(err)}`,
        )
      }
      return
    }
    if (!this.canStream || this.streamingMode === 'block' || this.canUseSlackNativeStreaming) {
      return
    }

    this.streamingActive = true
    this.startTypingTimer()
    if (!this.flushTimer) {
      this.startFlushTimer(this.baseFlushIntervalMs)
    }

    const text = this.truncateStatusPreview(label.trim())
    this.statusPreviewActive = true
    this.buffer = ''
    this.lastFlushed = ''

    try {
      if (this.ref && this.outbound.editText) {
        const result = await this.withTimeout(
          this.outbound.editText({
            ...this.buildParams(text),
            to: this.resolveEditAddress(this.ref.chatId),
            messageId: this.ref.messageId,
          }),
          this.flushEditTimeoutMs,
          'editText',
        )
        this.assertOk(result, 'editText')
        return
      }

      const result = await this.withTimeout(
        this.outbound.sendText(
          this.buildParams(text, undefined, {
            includeReplyTo: this.shouldIncludeReplyReference(0),
          }),
        ),
        this.opTimeoutMs,
        'sendText',
      )
      this.assertOk(result, 'sendText')
      if (result.messageId) {
        this.ref = {
          messageId: String(result.messageId),
          chatId: result.chatId ? String(result.chatId) : this.config.chatId,
        }
      }
    } catch (err) {
      // Progress is best-effort. Final delivery must remain reliable.
      console.warn(
        `[channel-adapter:${this.config.channelType}] status() failed: ${this.formatSafeError(err)}`,
      )
    }
  }

  async finalize(fullText: string): Promise<void> {
    if (this.finalized) return
    this.finalized = true
    this.finalizing = true
    this.closed = true
    this.streamingActive = false
    this.statusPreviewActive = false

    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.stopTypingTimer()

    // Avoid flush/finalize races (last streaming edit overwriting final text)
    await this.withTimeout(this.waitForFlushInFlight(), this.opTimeoutMs, 'flushInFlight').catch(() => {
      // fail-open to avoid hanging finalize forever
    })

    try {
      const telegramVoice = this.config.telegramVoice
      if (
        this.config.channelType === 'telegram' &&
        telegramVoice?.mode === 'always' &&
        this.outbound.sendMedia &&
        this.runtimeConfig
      ) {
        let tempVoiceFilePath: string | null = null
        try {
          const voiceMedia = await prepareVoiceReplyMedia({
            config: this.runtimeConfig,
            text: fullText,
            voice: telegramVoice.voiceId ?? undefined,
            instructions: telegramVoice.instructions ?? undefined,
            fileBaseName: 'telegram-voice-reply',
            tempDirName: 'lucid-telegram-voice',
          })
          tempVoiceFilePath = voiceMedia.filePath
          const voiceResult = await this.withTimeout(
            this.outbound.sendMedia({
              ...this.buildParams('', {
                ...(this.config.finalPlatformOptions || {}),
                audioAsVoice: true,
                mediaLocalRoots: [voiceMedia.localRoot],
              }),
              mediaUrl: voiceMedia.mediaUrl,
            }),
            this.finalizeOpTimeoutMs,
            'sendMedia',
          )
          this.assertOk(voiceResult, 'sendMedia')
          return
        } catch (err) {
          console.warn(
            `[channel-adapter:${this.config.channelType}] telegram voice finalize fallback: ${this.formatSafeError(err)}`,
          )
        } finally {
          await cleanupVoiceTempFile(tempVoiceFilePath)
        }
      }

      // Use OpenClaw's markdown-aware chunker instead of our simple chunkText()
      const chunks = fullText.length <= this.outbound.textChunkLimit
        ? [fullText]
        : this.outbound.chunker(fullText, this.outbound.textChunkLimit)

      if (this.nativeStreamRef && this.outbound.stopNativeStream) {
        const finalDelta = fullText.startsWith(this.lastFlushed)
          ? fullText.slice(this.lastFlushed.length)
          : fullText
        const result = await this.withTimeout(
          this.outbound.stopNativeStream({
            streamId: this.nativeStreamRef.streamId,
            ...(finalDelta.trim().length > 0 ? { text: finalDelta } : {}),
          }),
          this.finalizeOpTimeoutMs,
          'stopNativeStream',
        )
        this.assertOk(result, 'stopNativeStream')
        return
      }

      if (this.config.channelType === 'discord' && this.streamingMode === 'block') {
        const remainingText = fullText.startsWith(this.lastFlushed)
          ? fullText.slice(this.lastFlushed.length)
          : fullText
        if (remainingText.trim().length === 0) {
          return
        }
        const remainingChunks = remainingText.length <= this.outbound.textChunkLimit
          ? [remainingText]
          : this.outbound.chunker(remainingText, this.outbound.textChunkLimit)
        await this.sendChunks(remainingChunks, this.finalizeOpTimeoutMs, this.config.finalPlatformOptions)
      } else if (this.canStream && this.ref && this.outbound.editText) {
        // Streaming channel: edit placeholder with first chunk
        try {
          const editResult = await this.withTimeout(
            this.outbound.editText({
              ...this.buildParams(chunks[0], this.config.finalPlatformOptions),
              to: this.resolveEditAddress(this.ref.chatId),
              messageId: this.ref.messageId,
            }),
            this.finalizeOpTimeoutMs,
            'editText',
          )
          this.assertOk(editResult, 'editText')
        } catch {
          // Edit can fail due to platform constraints (permissions, age, 429).
          // Fail open by delivering full content as new messages.
          try {
            await this.sendChunks(chunks, this.finalizeOpTimeoutMs, this.config.finalPlatformOptions)
          } catch (sendErr) {
            console.error(
              `[channel-adapter:${this.config.channelType}] finalize() fallback send failed: ${this.formatSafeError(sendErr)}`,
            )
            throw sendErr
          }
          return
        }

        // Remaining chunks as new messages
        for (let i = 1; i < chunks.length; i++) {
          const result = await this.withTimeout(
            this.outbound.sendText(
              this.buildParams(chunks[i], undefined, {
                includeReplyTo: this.shouldIncludeReplyReference(i),
              }),
            ),
            this.finalizeOpTimeoutMs,
            'sendText',
          )
          this.assertOk(result, 'sendText')
        }
      } else {
        // Non-streaming: send all chunks as separate messages
        await this.sendChunks(chunks, this.finalizeOpTimeoutMs, this.config.finalPlatformOptions)
      }
    } catch (err) {
      console.error(
        `[channel-adapter:${this.config.channelType}] finalize() failed: ${this.formatSafeError(err)}`,
      )
      throw err
    } finally {
      this.buffer = ''
      this.lastFlushed = ''
      this.ref = null
      this.nativeStreamRef = null
      this.finalizing = false
    }
  }

  async error(_err: Error): Promise<void> {
    if (this.finalized) return
    this.finalized = true
    this.closed = true
    this.streamingActive = false

    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.stopTypingTimer()

    await this.withTimeout(this.waitForFlushInFlight(), this.opTimeoutMs, 'flushInFlight').catch(() => {
      // fail-open in error path
    })

    const errorText = '⚠️ Sorry, I encountered an error. Please try again.'

    try {
      if (this.nativeStreamRef && this.outbound.stopNativeStream) {
        const result = await this.withTimeout(
          this.outbound.stopNativeStream({
            streamId: this.nativeStreamRef.streamId,
            text: errorText,
          }),
          this.opTimeoutMs,
          'stopNativeStream',
        )
        this.assertOk(result, 'stopNativeStream')
      } else if (this.canStream && this.ref && this.outbound.editText) {
        const result = await this.withTimeout(
          this.outbound.editText({
            ...this.baseParams(errorText),
            to: this.resolveEditAddress(this.ref.chatId),
            messageId: this.ref.messageId,
          }),
          this.opTimeoutMs,
          'editText',
        )
        this.assertOk(result, 'editText')
      } else {
        const result = await this.withTimeout(
          this.outbound.sendText(this.baseParams(errorText)),
          this.opTimeoutMs,
          'sendText',
        )
        this.assertOk(result, 'sendText')
      }
    } catch (sendErr) {
      console.error(
        `[channel-adapter:${this.config.channelType}] error() send failed: ${this.formatSafeError(sendErr)}`,
      )
      throw sendErr
    } finally {
      this.buffer = ''
      this.lastFlushed = ''
      this.ref = null
      this.nativeStreamRef = null
    }
  }

  /* ─── Internal: Streaming Flush ─────────────── */

  private async flush(): Promise<void> {
    if (this.closed || this.finalizing) return
    if (!this.streamingActive) return
    if (this.flushing) return
    if (Date.now() < this.backoffUntil) return
    const isTelegramStream = this.config.channelType === 'telegram'
    const isInitialDiscordPreview =
      this.config.channelType === 'discord' &&
      !!this.ref &&
      this.lastFlushed.length === 0
    const minSize =
      isTelegramStream || isInitialDiscordPreview
        ? 1
        : (this.streaming.minBufferSize ?? MIN_BUFFER_SIZE)
    const delta = this.buffer.length - this.lastFlushed.length
    if (delta < minSize) return
    if (this.buffer === this.lastFlushed) return

    const op = (async () => {
      this.flushing = true
      try {
        const graphemes = Array.from(this.buffer)
        if (this.canUseSlackNativeStreaming && this.outbound.startNativeStream && this.outbound.appendNativeStream) {
          const nextText = this.buffer.startsWith(this.lastFlushed)
            ? this.buffer.slice(this.lastFlushed.length)
            : this.buffer
          if (nextText.trim().length === 0) {
            return
          }

          if (!this.nativeStreamRef) {
            const result = await this.withTimeout(
              this.outbound.startNativeStream({
                ...this.buildParams(''),
                text: nextText,
                recipientTeamId: this.config.slackRecipientTeamId,
                recipientUserId: this.config.slackRecipientUserId,
              }),
              this.opTimeoutMs,
              'startNativeStream',
            )
            this.assertOk(result, 'startNativeStream')
            if (!result.streamId) {
              this.streamingActive = false
              return
            }
            this.nativeStreamRef = { streamId: result.streamId }
            this.resetBackoffAfterSuccess()
            this.lastFlushed = this.buffer
            return
          }

          const result = await this.withTimeout(
            this.outbound.appendNativeStream({
              streamId: this.nativeStreamRef.streamId,
              text: nextText,
            }),
            this.flushEditTimeoutMs,
            'appendNativeStream',
          )
          this.assertOk(result, 'appendNativeStream')
          this.resetBackoffAfterSuccess()
          this.lastFlushed = this.buffer
          return
        }

        if (this.streamingMode === 'block') {
          const nextText = this.buffer.startsWith(this.lastFlushed)
            ? this.buffer.slice(this.lastFlushed.length)
            : this.buffer
          if (nextText.trim().length === 0) {
            return
          }
          const previewChunks = nextText.length <= this.outbound.textChunkLimit
            ? [nextText]
            : this.outbound.chunker(nextText, this.outbound.textChunkLimit)
          await this.sendChunks(previewChunks, this.opTimeoutMs)
          this.resetBackoffAfterSuccess()
          this.lastFlushed = this.buffer
          return
        }

        if (!this.ref) {
          const minInitialChars = isTelegramStream
            ? OpenClawChannelAdapter.TELEGRAM_MIN_INITIAL_STREAM_CHARS
            : minSize
          if (graphemes.length < minInitialChars) {
            return
          }
          const text = this.truncateStreamingPreview(this.buffer, !isTelegramStream)

          if (this.closed || this.finalizing) return
          const result = await this.withTimeout(
            this.outbound.sendText(
              this.buildParams(text, undefined, {
                includeReplyTo: this.shouldIncludeReplyReference(0),
              }),
            ),
            this.opTimeoutMs,
            'sendText',
          )
          this.assertOk(result, 'sendText')
          if (!result.messageId) {
            this.streamingActive = false
            return
          }
          this.ref = {
            messageId: String(result.messageId),
            chatId: result.chatId ? String(result.chatId) : this.config.chatId,
          }
          this.resetBackoffAfterSuccess()
          this.lastFlushed = this.buffer
          return
        }

        if (!this.ref || !this.outbound.editText) return
        const text = this.truncateStreamingPreview(this.buffer, !isTelegramStream)

        if (this.closed || this.finalizing) return
        const result = await this.withTimeout(
          this.outbound.editText!({
            ...this.baseParams(text),
            to: this.resolveEditAddress(this.ref!.chatId),
            messageId: this.ref!.messageId,
          }),
          this.flushEditTimeoutMs,
          'editText',
        )
        this.assertOk(result, 'editText')
        this.resetBackoffAfterSuccess()
        this.lastFlushed = this.buffer
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.applyRateLimitBackoff()
        }
        // Retry next interval (with backoff if rate-limited)
      } finally {
        this.flushing = false
      }
    })()

    this.flushInFlight = op
    await op
    if (this.flushInFlight === op) this.flushInFlight = null
  }
}

/* ─── Channel Registry ─────────────── */

/**
 * Global channel registry. Channels register here at startup.
 * The pipeline uses this to resolve the correct adapter for a channel type.
 */
const channelRegistry = new Map<string, ChannelRegistration>()

/**
 * Register a channel's OpenClaw extension for use in our pipeline.
 *
 * Call this at worker startup for each channel you want to support:
 * ```typescript
 * registerChannel({
 *   channelType: 'telegram',
 *   outbound: telegramPlugin.outbound,  // from OpenClaw
 *   streaming: { supportsEditing: true },
 * })
 * ```
 */
export function registerChannel(registration: ChannelRegistration): void {
  if (channelRegistry.has(registration.channelType)) {
    throw new Error(`[channel-registry] Channel already registered: ${registration.channelType}`)
  }
  channelRegistry.set(registration.channelType, registration)
  console.log(`[channel-registry] Registered channel: ${registration.channelType}`)
}

/**
 * Create a ChannelOutput for a given channel type using the registered adapter.
 * Returns null if the channel type is not registered (fallback to legacy implementations).
 */
export function createChannelOutput(
  channelType: string,
  config: ChannelOutputConfig,
): ChannelOutput | null {
  const registration = channelRegistry.get(channelType)
  if (!registration) return null

  return new OpenClawChannelAdapter(
    registration.outbound,
    registration.streaming,
    config,
  )
}

/**
 * Check if a channel type has a registered adapter.
 */
export function hasChannelAdapter(channelType: string): boolean {
  return channelRegistry.has(channelType)
}

/**
 * List all registered channel types.
 */
export function listRegisteredChannels(): string[] {
  return Array.from(channelRegistry.keys())
}
