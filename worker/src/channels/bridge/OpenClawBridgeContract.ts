/**
 * P2-15a OpenClaw bridge contract.
 *
 * This file defines the minimum outbound shape we accept from vendored
 * OpenClaw channel plugins before adapting them into our ChannelOutput path.
 *
 * Control-plane invariants (dedup/lock/rate/policy/encryption/runId) remain
 * outside this bridge in inbound pipeline processors.
 */

export interface OpenClawOutboundBridgeContract {
  deliveryMode: 'direct' | 'streamed'
  chunker: (text: string, limit: number) => string[]
  chunkerMode: 'markdown' | 'plain'
  textChunkLimit: number
  sendText: (params: {
    to: string
    text: string
    accountId?: string
    replyToId?: string
    threadId?: string
    deps?: Record<string, unknown>
    platformOptions?: Record<string, unknown>
  }) => Promise<{
    channel: string
    messageId?: string | number
    chatId?: string
    ok?: boolean
    error?: string
  }>
  sendMedia?: (params: {
    to: string
    text: string
    mediaUrl: string
    accountId?: string
    replyToId?: string
    threadId?: string
    deps?: Record<string, unknown>
    platformOptions?: Record<string, unknown>
  }) => Promise<{
    channel: string
    messageId?: string | number
    chatId?: string
    ok?: boolean
    error?: string
  }>
  editText?: (params: {
    to: string
    text: string
    messageId: string
    accountId?: string
    replyToId?: string
    threadId?: string
    deps?: Record<string, unknown>
    platformOptions?: Record<string, unknown>
  }) => Promise<{
    channel: string
    messageId?: string | number
    chatId?: string
    ok?: boolean
    error?: string
  }>
}

export interface OpenClawChannelPluginBridgeContract {
  id: string
  outbound: OpenClawOutboundBridgeContract
}

function isFn(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

/**
 * Runtime contract guard used by bridge factories.
 */
export function assertOpenClawOutboundContract(
  channelType: string,
  outbound: unknown,
): asserts outbound is OpenClawOutboundBridgeContract {
  if (!outbound || typeof outbound !== 'object') {
    throw new Error(`[bridge:${channelType}] missing outbound contract`)
  }

  const candidate = outbound as Record<string, unknown>
  const deliveryMode = candidate.deliveryMode
  if (deliveryMode !== 'direct' && deliveryMode !== 'streamed') {
    throw new Error(`[bridge:${channelType}] outbound.deliveryMode must be 'direct' or 'streamed'`)
  }
  if (!isFn(candidate.chunker)) {
    throw new Error(`[bridge:${channelType}] outbound.chunker must be a function`)
  }
  if (candidate.chunkerMode !== 'markdown' && candidate.chunkerMode !== 'plain') {
    throw new Error(`[bridge:${channelType}] outbound.chunkerMode must be 'markdown' or 'plain'`)
  }
  if (typeof candidate.textChunkLimit !== 'number' || candidate.textChunkLimit <= 0) {
    throw new Error(`[bridge:${channelType}] outbound.textChunkLimit must be a positive number`)
  }
  if (!isFn(candidate.sendText)) {
    throw new Error(`[bridge:${channelType}] outbound.sendText must be a function`)
  }
  if (candidate.sendMedia != null && !isFn(candidate.sendMedia)) {
    throw new Error(`[bridge:${channelType}] outbound.sendMedia must be a function when provided`)
  }
  if (candidate.editText != null && !isFn(candidate.editText)) {
    throw new Error(`[bridge:${channelType}] outbound.editText must be a function when provided`)
  }
}
