/**
 * OpenClaw Runtime — hand-written type declarations.
 *
 * dts:true fails because OpenClaw's internal deps (grammy, discord-api-types, etc.)
 * aren't installed at build time. These declarations cover the 9 exported functions
 * with types matching the worker's actual usage patterns.
 *
 * Opts parameters use Record<string, unknown> (matching existing worker shim pattern).
 * Return types are precise where the worker reads from them.
 */

// ─── Agent Runtime ───────────────────────────────────────────────────────────

export interface EmbeddedPiAgentMeta {
  sessionId: string
  provider: string
  model: string
  compactionCount?: number
  promptTokens?: number
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number }
  lastCallUsage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number }
}

export interface EmbeddedPiRunMeta {
  durationMs: number
  agentMeta?: EmbeddedPiAgentMeta
  aborted?: boolean
  systemPromptReport?: Record<string, unknown>
  error?: {
    kind: 'context_overflow' | 'compaction_failure' | 'role_ordering' | 'image_size' | 'retry_limit'
    message: string
  }
  stopReason?: string
  pendingToolCalls?: Array<{ id: string; name: string; arguments: string }>
}

export interface EmbeddedPiRunResult {
  payloads?: Array<{
    text?: string
    mediaUrl?: string
    mediaUrls?: string[]
    replyToId?: string
    isError?: boolean
  }>
  meta: EmbeddedPiRunMeta
  didSendViaMessagingTool?: boolean
  messagingToolSentTexts?: string[]
  messagingToolSentMediaUrls?: string[]
  messagingToolSentTargets?: Array<Record<string, unknown>>
  successfulCronAdds?: number
}

export interface EmbeddedPiCompactResult {
  ok: boolean
  compacted: boolean
  reason?: string
  result?: {
    summary: string
    firstKeptEntryId: string
    tokensBefore: number
    tokensAfter?: number
    details?: unknown
  }
}

export declare function runEmbeddedPiAgent(
  params: Record<string, unknown>,
): Promise<EmbeddedPiRunResult>

export declare function compactEmbeddedPiSession(
  params: Record<string, unknown>,
): Promise<EmbeddedPiCompactResult>

// ─── Config ──────────────────────────────────────────────────────────────────

export declare function setRuntimeConfigSnapshot(
  config: Record<string, unknown>,
  sourceConfig?: Record<string, unknown>,
): void

// ─── Telegram ────────────────────────────────────────────────────────────────

export interface TelegramSendResult {
  messageId: string
  chatId: string
}

export interface TelegramEditResult {
  ok: true
  messageId: string
  chatId: string
}

export interface TelegramReactionResult {
  ok: true
}

export declare function sendMessageTelegram(
  to: string,
  text: string,
  opts?: Record<string, unknown>,
): Promise<TelegramSendResult>

export declare function editMessageTelegram(
  chatId: string | number,
  messageId: string | number,
  text: string,
  opts?: Record<string, unknown>,
): Promise<TelegramEditResult>

export declare function reactMessageTelegram(
  chatId: string | number,
  messageId: string | number,
  emoji: string,
  opts?: Record<string, unknown>,
): Promise<TelegramReactionResult | { ok: false; warning: string }>

export declare function sendStickerTelegram(
  to: string,
  fileId: string,
  opts?: Record<string, unknown>,
): Promise<TelegramSendResult>

// ─── Discord ─────────────────────────────────────────────────────────────────

export interface DiscordSendResult {
  messageId: string
  channelId: string
}

export interface DiscordAPIMessage {
  id: string
  channel_id?: string
  [key: string]: unknown
}

export declare function sendMessageDiscord(
  to: string,
  text: string,
  opts?: Record<string, unknown>,
): Promise<DiscordSendResult>

export declare function editMessageDiscord(
  channelId: string,
  messageId: string,
  payload: { content?: string },
  opts?: Record<string, unknown>,
): Promise<DiscordAPIMessage>

export declare function sendVoiceMessageDiscord(
  to: string,
  audioPath: string,
  opts?: Record<string, unknown>,
): Promise<DiscordSendResult>

// ─── Slack ───────────────────────────────────────────────────────────────────

export interface SlackSendResult {
  messageId: string
  channelId: string
}

export declare function sendMessageSlack(
  to: string,
  message: string,
  opts?: Record<string, unknown>,
): Promise<SlackSendResult>

export declare function editSlackMessage(
  channelId: string,
  messageId: string,
  content: string,
  opts?: Record<string, unknown>,
): Promise<void>

// ─── iMessage ────────────────────────────────────────────────────────────────

export interface IMessageSendResult {
  messageId: string
}

export declare function sendMessageIMessage(
  to: string,
  text: string,
  opts?: Record<string, unknown>,
): Promise<IMessageSendResult>

export declare function probeIMessage(
  opts?: Record<string, unknown>,
): Promise<Record<string, unknown>>

export declare function monitorIMessageProvider(
  opts?: Record<string, unknown>,
): Promise<void>
