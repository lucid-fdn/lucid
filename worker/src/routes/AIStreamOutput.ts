/**
 * AIStreamOutput — ChannelOutput backed by Vercel AI SDK's UIMessageStream.
 *
 * Uses the official `createUIMessageStream` writer so we never hand-craft
 * the wire protocol. If Vercel changes the format, upgrading `ai` is enough.
 *
 * Implements the same ChannelOutput interface used by Telegram/WhatsApp,
 * so the AgentLoop doesn't know or care that it's streaming to a web browser.
 *
 * Keep-alive: emits empty text-delta every 15s during silent periods (tool calls,
 * DB queries, long reasoning) to prevent idle proxy disconnects.
 */

import type { UIMessageStreamWriter } from 'ai'
import type { ChannelOutput, MessageRef } from '../channels/ChannelOutput.js'

export class AIStreamOutput implements ChannelOutput {
  private textId: string
  private reasoningId: string | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private closed = false

  constructor(private writer: UIMessageStreamWriter) {
    this.textId = crypto.randomUUID()
  }

  async begin(): Promise<MessageRef | null> {
    this.writer.write({ type: 'text-start', id: this.textId })

    // Keep-alive every 15s using empty text-delta to prevent idle proxy disconnects.
    // Must use a schema-valid event type — custom types like 'data-ping' fail
    // z.strictObject() validation on the client and silently kill the stream.
    this.pingInterval = setInterval(() => {
      if (!this.closed) {
        try {
          this.writer.write({ type: 'text-delta', id: this.textId, delta: '' })
        } catch {
          // Writer may be closed
        }
      }
    }, 15_000)

    return null
  }

  async append(delta: string): Promise<void> {
    if (!delta || this.closed) return
    this.writer.write({ type: 'text-delta', id: this.textId, delta })
  }

  async status(label: string): Promise<void> {
    if (this.closed || !label.trim()) return
    this.writer.write({
      type: 'data-progress-status',
      data: {
        label: label.trim(),
        timestamp: new Date().toISOString(),
      },
    })
  }

  /** Emit reasoning delta (shows thinking in Reasoning component) */
  reasoningStream(text: string): void {
    if (this.closed) return
    if (!this.reasoningId) {
      this.reasoningId = crypto.randomUUID()
      this.writer.write({ type: 'reasoning-start', id: this.reasoningId })
    }
    this.writer.write({ type: 'reasoning-delta', id: this.reasoningId, delta: text })
  }

  /** Emit reasoning end */
  reasoningEnd(): void {
    if (this.closed || !this.reasoningId) return
    this.writer.write({ type: 'reasoning-end', id: this.reasoningId })
    this.reasoningId = null
  }

  /** Emit a tool invocation start (shows "running..." in chain-of-thought) */
  toolStart(toolCallId: string, toolName: string): void {
    if (this.closed) return
    this.writer.write({
      type: 'tool-input-available',
      toolCallId,
      toolName,
      input: {},
      dynamic: true,
    })
  }

  /** Emit a tool result (shows "done" / "error" in chain-of-thought) */
  toolResult(toolCallId: string, output: unknown): void {
    if (this.closed) return
    this.writer.write({
      type: 'tool-output-available',
      toolCallId,
      output,
      dynamic: true,
    })
  }

  /** Emit a tool error */
  toolError(toolCallId: string, errorText: string): void {
    if (this.closed) return
    this.writer.write({
      type: 'tool-output-error',
      toolCallId,
      errorText,
      dynamic: true,
    })
  }

  async finalize(_fullText: string): Promise<void> {
    if (this.closed) return
    this.cleanup()
    this.writer.write({ type: 'text-end', id: this.textId })
    this.closed = true
  }

  async error(err: Error): Promise<void> {
    if (this.closed) return
    this.cleanup()
    this.writer.write({ type: 'error', errorText: err.message || 'Agent processing failed' })
    this.closed = true
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }
}
