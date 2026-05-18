/**
 * Slack OpenClaw Plugin - implements OpenClawChannelPluginBridgeContract
 * using Slack Web API chat.postMessage calls.
 */

import crypto from 'node:crypto'
import { WebClient } from '@slack/web-api'
import type { OpenClawChannelPluginBridgeContract } from '../OpenClawBridgeContract.js'

const SLACK_MESSAGE_LIMIT = 40_000

function slackChunker(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('\n\n', limit)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', limit)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', limit)
    if (splitAt <= 0) splitAt = limit

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

type SlackPostMessageResponse = {
  ok?: boolean
  ts?: string
  channel?: string
  error?: string
}

type SlackUpdateMessageResponse = {
  ok?: boolean
  ts?: string
  channel?: string
  error?: string
}

type SlackApiResponse = {
  ok?: boolean
  error?: string
}

export interface SlackPlugin extends OpenClawChannelPluginBridgeContract {
  nativeStreaming: {
    start: (params: {
      channel: string
      threadTs: string
      text: string
      recipientTeamId?: string
      recipientUserId?: string
    }) => Promise<{ ok: boolean; streamId?: string; error?: string }>
    append: (params: {
      streamId: string
      text: string
    }) => Promise<{ ok: boolean; error?: string }>
    stop: (params: {
      streamId: string
      text?: string
    }) => Promise<{ ok: boolean; error?: string }>
    setStatus: (params: {
      channel: string
      threadTs: string
      status: string
    }) => Promise<{ ok: boolean; error?: string }>
  }
  reactions: {
    remove: (params: {
      channel: string
      timestamp: string
      name: string
    }) => Promise<{ ok: boolean; error?: string }>
  }
}

async function callSlackApi<TResponse extends SlackApiResponse>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: TResponse; error?: string }> {
  try {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = (await response.json().catch(() => null)) as TResponse | null
    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        error: data?.error || `Slack API error (${response.status})`,
      }
    }

    return { ok: true, data: data ?? undefined }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function createSlackPlugin(
  secrets: Record<string, string>,
): SlackPlugin {
  const { bot_token } = secrets

  if (!bot_token) {
    throw new Error('[slack-plugin] bot_token is required')
  }

  const client = new WebClient(bot_token)
  const activeStreams = new Map<string, ReturnType<WebClient['chatStream']>>()

  return {
    id: 'slack',
    outbound: {
      deliveryMode: 'streamed',
      chunker: slackChunker,
      chunkerMode: 'plain',
      textChunkLimit: SLACK_MESSAGE_LIMIT,

      sendText: async (params) => {
        const threadTs =
          params.threadId ||
          params.replyToId ||
          (typeof params.platformOptions?.threadTs === 'string'
            ? params.platformOptions.threadTs
            : undefined)

        const result = await callSlackApi<SlackPostMessageResponse>(bot_token, 'chat.postMessage', {
          channel: params.to,
          text: params.text,
          ...(threadTs ? { thread_ts: threadTs } : {}),
        })
        if (!result.ok) {
          return {
            channel: 'slack',
            ok: false,
            error: result.error,
          }
        }

        const data = result.data
        return {
          channel: 'slack',
          ok: true,
          messageId: data?.ts,
          chatId: data?.channel || params.to,
        }
      },

      editText: async (params) => {
        const result = await callSlackApi<SlackUpdateMessageResponse>(bot_token, 'chat.update', {
          channel: params.to,
          ts: params.messageId,
          text: params.text,
        })
        if (!result.ok) {
          return {
            channel: 'slack',
            ok: false,
            error: result.error,
          }
        }

        const data = result.data
        return {
          channel: 'slack',
          ok: true,
          messageId: data?.ts || params.messageId,
          chatId: data?.channel || params.to,
        }
      },
    },
    nativeStreaming: {
      start: async ({ channel, threadTs, text, recipientTeamId, recipientUserId }) => {
        try {
          const streamer = client.chatStream({
            channel,
            thread_ts: threadTs,
            ...(recipientTeamId ? { recipient_team_id: recipientTeamId } : {}),
            ...(recipientUserId ? { recipient_user_id: recipientUserId } : {}),
          })
          const streamId = crypto.randomUUID()
          activeStreams.set(streamId, streamer)
          if (text.trim().length > 0) {
            await streamer.append({ markdown_text: text })
          }
          return { ok: true, streamId }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
      append: async ({ streamId, text }) => {
        const streamer = activeStreams.get(streamId)
        if (!streamer) {
          return { ok: false, error: 'stream_not_found' }
        }
        if (text.trim().length === 0) {
          return { ok: true }
        }
        try {
          await streamer.append({ markdown_text: text })
          return { ok: true }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
      stop: async ({ streamId, text }) => {
        const streamer = activeStreams.get(streamId)
        if (!streamer) {
          return { ok: false, error: 'stream_not_found' }
        }
        activeStreams.delete(streamId)
        try {
          await streamer.stop(text && text.trim().length > 0 ? { markdown_text: text } : undefined)
          return { ok: true }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
      setStatus: async ({ channel, threadTs, status }) => {
        const result = await callSlackApi<SlackApiResponse>(bot_token, 'assistant.threads.setStatus', {
          channel_id: channel,
          thread_ts: threadTs,
          status,
        })
        if (!result.ok) {
          return { ok: false, error: result.error }
        }
        return { ok: true }
      },
    },
    reactions: {
      remove: async ({ channel, timestamp, name }) => {
        const result = await callSlackApi<SlackApiResponse>(bot_token, 'reactions.remove', {
          channel,
          timestamp,
          name,
        })
        if (!result.ok) {
          return { ok: false, error: result.error }
        }
        return { ok: true }
      },
    },
  }
}
