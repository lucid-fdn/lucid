/**
 * ChannelOutput — Abstraction for delivering AI responses to messaging channels.
 * 
 * Each channel (Telegram, WhatsApp, Discord) implements this interface differently:
 * - Telegram: placeholder → throttled edits → finalize (streaming UX)
 * - Discord: preview send → throttled edits → finalize (streaming UX)
 * - WhatsApp: optional ack-if-slow → final send (no streaming)
 *
 * The inbound processor calls these methods; channel-specific UX logic
 * (rate limits, chunking, edit throttling) is encapsulated here.
 */

export interface MessageRef {
  /** Platform message ID (e.g., Telegram message_id) */
  messageId: string
  /** Platform chat ID */
  chatId: string
}

export interface ChannelOutputConfig {
  /** Channel ID in our database */
  channelId: string
  /** Platform chat ID to send messages to */
  chatId: string
  /** Optional: message to reply to */
  replyToMessageId?: string
  /** Optional reply behavior for chunked sends/stream starts */
  replyToMode?: 'off' | 'all' | 'first'
  /** Bot token or API credentials */
  botToken: string
  /** Channel type for logging */
  channelType: 'telegram' | 'whatsapp' | 'discord' | 'slack'
  /** Optional account identifier for multi-account channel plugins */
  accountId?: string
  /** Optional thread identifier for threaded channel plugins */
  threadId?: string
  /** Optional dependency bag for plugin-specific clients/test doubles */
  deps?: Record<string, unknown>
  /** Optional platform-specific options applied only to final delivery/edit */
  finalPlatformOptions?: Record<string, unknown>
  /** Optional Slack streaming mode */
  slackStreamingMode?: 'off' | 'partial' | 'block' | 'progress'
  /** Optional Discord streaming mode */
  discordStreamingMode?: 'off' | 'partial' | 'block' | 'progress'
  /** Optional Discord typing feedback while generation is in progress */
  discordTypingFeedback?: boolean
  /** Optional Slack native streaming preference */
  slackNativeStreaming?: boolean
  /** Optional Slack recipient workspace id for native streaming */
  slackRecipientTeamId?: string
  /** Optional Slack DM recipient user id for native streaming */
  slackRecipientUserId?: string
  /** Optional Telegram voice reply policy for direct inbound delivery */
  telegramVoice?: {
    mode: 'off' | 'auto' | 'always'
    voiceId?: string | null
    instructions?: string | null
  }
}

/**
 * Core interface that all channel outputs must implement.
 * 
 * Lifecycle: begin() → append()* → finalize() OR error()
 */
export interface ChannelOutput {
  /**
   * Begin output delivery.
   * For streaming channels: sends a placeholder message ("…" or typing indicator).
   * For non-streaming: may send an ack if generation is slow.
   * Returns a reference to the sent message (for later edits).
   */
  begin(): Promise<MessageRef | null>

  /**
   * Publish a transient progress/status update.
   *
   * Implementations should prefer native status/edit-in-place behavior and must
   * not make this text part of the final assistant answer. Channels without a
   * safe transient primitive may ignore the update.
   */
  status?(label: string): Promise<void>

  /**
   * Append a text delta (streaming token).
   * For streaming channels: buffers deltas and periodically flushes via message edit.
   * For non-streaming: no-op (accumulated internally for finalize).
   * 
   * @param delta - The text chunk from the LLM stream
   */
  append(delta: string): Promise<void>

  /**
   * Finalize the output with the complete response text.
   * For streaming channels: sends the final edit (or overflow chunks if > char limit).
   * For non-streaming: sends the complete message (possibly chunked).
   * 
   * @param fullText - The complete AI response
   */
  finalize(fullText: string): Promise<void>

  /**
   * Handle an error during generation.
   * Sends a user-friendly error message to the channel.
   * 
   * @param err - The error that occurred
   */
  error(err: Error): Promise<void>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Telegram message text limit (send & edit) */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096

/** WhatsApp recommended chunk size */
export const WHATSAPP_CHUNK_SIZE = 1500

/** Default streaming flush interval (ms) */
export const DEFAULT_FLUSH_INTERVAL_MS = 1000

/** Minimum chars to buffer before flushing */
export const MIN_BUFFER_SIZE = 80

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split text into chunks that respect a maximum length.
 * Tries to break at paragraph, sentence, or word boundaries.
 */
export function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    // Try to find a good break point
    let breakPoint = maxLength

    // Prefer paragraph break
    const paragraphBreak = remaining.lastIndexOf('\n\n', maxLength)
    if (paragraphBreak > maxLength * 0.5) {
      breakPoint = paragraphBreak + 2
    } else {
      // Try sentence break
      const sentenceBreak = remaining.lastIndexOf('. ', maxLength)
      if (sentenceBreak > maxLength * 0.5) {
        breakPoint = sentenceBreak + 2
      } else {
        // Try word break
        const wordBreak = remaining.lastIndexOf(' ', maxLength)
        if (wordBreak > maxLength * 0.3) {
          breakPoint = wordBreak + 1
        }
        // Otherwise hard break at maxLength
      }
    }

    chunks.push(remaining.slice(0, breakPoint))
    remaining = remaining.slice(breakPoint)
  }

  return chunks
}
