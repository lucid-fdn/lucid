declare module '@lucid/openclaw-runtime' {
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

  export function runEmbeddedPiAgent(
    params: Record<string, unknown>,
  ): Promise<EmbeddedPiRunResult>

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

  export interface DiscordSendResult {
    messageId: string
    channelId: string
  }

  export interface DiscordAPIMessage {
    id: string
    channel_id?: string
    [key: string]: unknown
  }

  export interface IMessageSendResult {
    messageId: string
  }

  export function sendMessageTelegram(
    to: string,
    text: string,
    opts?: Record<string, unknown>,
  ): Promise<TelegramSendResult>

  export function editMessageTelegram(
    chatId: string | number,
    messageId: string | number,
    text: string,
    opts?: Record<string, unknown>,
  ): Promise<TelegramEditResult>

  export function reactMessageTelegram(
    chatId: string | number,
    messageId: string | number,
    emoji: string,
    opts?: Record<string, unknown>,
  ): Promise<TelegramReactionResult | { ok: false; warning: string }>

  export function sendStickerTelegram(
    to: string,
    fileId: string,
    opts?: Record<string, unknown>,
  ): Promise<TelegramSendResult>

  export function sendMessageDiscord(
    to: string,
    text: string,
    opts?: Record<string, unknown>,
  ): Promise<DiscordSendResult>

  export function sendVoiceMessageDiscord(
    to: string,
    audioPath: string,
    opts?: Record<string, unknown>,
  ): Promise<DiscordSendResult>

  export function editMessageDiscord(
    channelId: string,
    messageId: string,
    payload: { content?: string },
    opts?: Record<string, unknown>,
  ): Promise<DiscordAPIMessage>

  export function sendMessageIMessage(
    to: string,
    text: string,
    opts?: Record<string, unknown>,
  ): Promise<IMessageSendResult>

  export function setRuntimeConfigSnapshot(
    config: Record<string, unknown>,
    sourceConfig?: Record<string, unknown>,
  ): void
}
