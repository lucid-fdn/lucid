/**
 * Discord native channel adapter (C2a — dedicated runtime only).
 *
 * Implements `NativeChannelAdapter` for BYOB Discord bots. Each `start()`
 * call binds one bot token to one assistant, runs a raw WebSocket gateway
 * connection in-process, and replies via the REST API. The runtime owns the
 * token — control plane never sees it.
 *
 * ## Why raw WebSocket instead of @buape/carbon
 *
 * Carbon is designed for full OAuth bot frameworks (declarative command
 * registration, interaction routing, slash commands). BYOB only needs the
 * gateway subset: connect → listen for MESSAGE_CREATE → reply via REST. The
 * raw WS path is ~150 lines, zero new deps, and reuses the exact pattern
 * already shipping in `DiscordGatewayManager.ts` (the shared-worker path).
 *
 * The plan doc initially called for a Carbon wrapper. That was reconsidered
 * during implementation: Carbon's value shows up in v2a hosted bots (command
 * registration, interactions), not BYOB. When v2a ships we can layer Carbon
 * on top of the hosted path without touching this adapter.
 *
 * ## Lifecycle contract (per `NativeChannelAdapter`)
 *
 *   start() resolves when the gateway reports READY (connected).
 *   start() rejects with `PermanentChannelError` if:
 *     - REST /users/@me or /gateway/bot returns 401/403 (revoked token)
 *     - Gateway close code is 4004 (auth failed) / 4013-4014 (disallowed intents)
 *   After start() resolves, the connection keeps running until `signal.aborted`.
 *   On abort, the adapter closes the socket and clears heartbeat timers.
 *
 * ## Message routing
 *
 * Forwards to `handlers.onMessage(userId, chatId, text, threadId?)` when:
 *   - Message is a DM to the bot, OR
 *   - Message mentions the bot in a guild channel
 * Ignores bot messages (including our own) and empty content after
 * mention-stripping. If onMessage returns a string, posts it back via
 * `POST /channels/{chatId}/messages`.
 */

import { PermanentChannelError } from '../errors.js'
import type {
  NativeChannelAdapter,
  NativeChannelHandlers,
  NativeChannelStartParams,
} from '../native/adapter-registry.js'

// Discord gateway intents we need.
// GUILDS(0) | GUILD_MESSAGES(9) | GUILD_MESSAGE_REACTIONS(10) | DIRECT_MESSAGES(12) | MESSAGE_CONTENT(15)
const INTENTS =
  (1 << 0) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 15)

const DISCORD_API = 'https://discord.com/api/v10'

interface DiscordMessage {
  id: string
  channel_id: string
  guild_id?: string
  content: string
  author: { id: string; username: string; bot?: boolean }
  mentions?: Array<{ id: string }>
  thread?: { id: string }
  message_reference?: { message_id?: string }
}

interface GatewayPayload {
  op: number
  d: unknown
  s: number | null
  t: string | null
}

const DISCORD_CHANNEL_TYPE = 'discord'

export const discordNativeAdapter: NativeChannelAdapter = {
  channelType: DISCORD_CHANNEL_TYPE,

  async start(
    params: NativeChannelStartParams,
    signal: AbortSignal,
    handlers: NativeChannelHandlers,
  ): Promise<void> {
    const botToken = params.credentials.bot_token
    if (!botToken) {
      throw new PermanentChannelError(
        `discord: bot_token not configured for account ${params.accountId}`,
      )
    }

    // 1. Resolve bot user id + gateway URL (catches revoked tokens early).
    const { botUserId, gatewayUrl } = await resolveBotContext(botToken)

    // 2. Connect to gateway and wait for READY.
    const authHeader = `Bot ${botToken}`
    await connectGateway({
      botToken,
      botUserId,
      gatewayUrl,
      authHeader,
      accountId: params.accountId,
      signal,
      onInbound: async (msg) => {
        // Skip bots (including ourselves) to prevent feedback loops.
        if (msg.author.bot || msg.author.id === botUserId) return

        // DM (no guild_id) → always engage.
        // Guild message → only if bot is @mentioned.
        const isDm = !msg.guild_id
        const isMention =
          (msg.mentions?.some((m) => m.id === botUserId) ?? false) ||
          new RegExp(`<@!?${botUserId}>`).test(msg.content)
        if (!isDm && !isMention) return

        // Strip @mention so the agent sees clean text.
        let text = msg.content
        if (isMention) {
          text = text.replace(new RegExp(`<@!?${botUserId}>`, 'g'), '').trim()
        }
        if (!text) return

        const reply = await handlers.onMessage(
          msg.author.id,
          msg.channel_id,
          text,
          msg.thread?.id,
        )

        if (reply && reply.trim().length > 0) {
          await sendReply(authHeader, msg.channel_id, reply, msg.id)
        }
      },
    })
  },
}

// ─── REST helpers ────────────────────────────────────────────────────────

async function resolveBotContext(botToken: string): Promise<{
  botUserId: string
  gatewayUrl: string
}> {
  const authHeader = `Bot ${botToken}`

  const meResp = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: authHeader },
  })
  if (meResp.status === 401 || meResp.status === 403) {
    throw new PermanentChannelError(
      `discord: ${meResp.status} ${meResp.statusText} on /users/@me — bot token revoked or invalid`,
    )
  }
  if (!meResp.ok) {
    throw new Error(`discord: /users/@me failed (${meResp.status})`)
  }
  const me = (await meResp.json()) as { id: string }

  const gwResp = await fetch(`${DISCORD_API}/gateway/bot`, {
    headers: { Authorization: authHeader },
  })
  if (gwResp.status === 401 || gwResp.status === 403) {
    throw new PermanentChannelError(
      `discord: ${gwResp.status} ${gwResp.statusText} on /gateway/bot — bot token revoked or invalid`,
    )
  }
  if (!gwResp.ok) {
    throw new Error(`discord: /gateway/bot failed (${gwResp.status})`)
  }
  const gw = (await gwResp.json()) as { url: string }

  return { botUserId: me.id, gatewayUrl: gw.url }
}

async function sendReply(
  authHeader: string,
  channelId: string,
  text: string,
  replyToMessageId: string,
): Promise<void> {
  // Discord hard-caps message content at 2000 chars.
  const content = text.length > 2000 ? text.slice(0, 1997) + '...' : text

  const resp = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      message_reference: { message_id: replyToMessageId, fail_if_not_exists: false },
      allowed_mentions: { parse: [] },
    }),
  })

  if (resp.status === 401 || resp.status === 403) {
    throw new PermanentChannelError(
      `discord: ${resp.status} on send — bot token revoked or missing channel permissions`,
    )
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`discord: send failed (${resp.status}): ${errText.slice(0, 200)}`)
  }
}

// ─── Gateway WS ──────────────────────────────────────────────────────────

interface ConnectArgs {
  botToken: string
  botUserId: string
  gatewayUrl: string
  authHeader: string
  accountId: string
  signal: AbortSignal
  onInbound: (msg: DiscordMessage) => Promise<void>
}

/**
 * Opens the gateway WS, resolves when READY is received, and keeps the
 * connection alive in the background until `signal.aborted`. Rejects with
 * PermanentChannelError on 4004/4013/4014 close codes during the initial
 * handshake.
 */
function connectGateway(args: ConnectArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let lastSeq: number | null = null
    const ws = new WebSocket(`${args.gatewayUrl}?v=10&encoding=json`)

    const cleanup = (): void => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'shutdown')
        }
      } catch {
        // ignore close errors
      }
    }

    // Abort → close socket. If start() already resolved, this is the normal
    // shutdown path and the promise is long gone. If we're still in handshake,
    // reject so NativeChannelManager doesn't hang.
    const onAbort = (): void => {
      cleanup()
      if (!settled) {
        settled = true
        reject(new Error('discord: aborted during handshake'))
      }
    }
    args.signal.addEventListener('abort', onAbort, { once: true })

    ws.addEventListener('open', () => {
      console.log(
        `[discord-native] ${args.accountId} gateway connected, waiting for HELLO`,
      )
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      let payload: GatewayPayload
      try {
        const raw = typeof event.data === 'string'
          ? event.data
          : (event.data as Buffer).toString('utf8')
        payload = JSON.parse(raw) as GatewayPayload
      } catch {
        return
      }

      if (payload.s !== null) lastSeq = payload.s

      switch (payload.op) {
        case 10: {
          // HELLO → start heartbeat + identify
          const { heartbeat_interval } = payload.d as { heartbeat_interval: number }
          heartbeatTimer = setInterval(() => {
            try {
              ws.send(JSON.stringify({ op: 1, d: lastSeq }))
            } catch {
              // socket closed; onclose handler will clean up
            }
          }, heartbeat_interval)

          ws.send(JSON.stringify({
            op: 2,
            d: {
              token: args.botToken,
              intents: INTENTS,
              properties: {
                os: 'linux',
                browser: 'lucid-native-adapter',
                device: 'lucid-native-adapter',
              },
            },
          }))
          break
        }

        case 0: {
          // DISPATCH
          if (payload.t === 'READY') {
            console.log(`[discord-native] ${args.accountId} READY`)
            if (!settled) {
              settled = true
              resolve()
            }
          } else if (payload.t === 'MESSAGE_CREATE') {
            const msg = payload.d as DiscordMessage
            // Fire-and-forget — onInbound drives the agent loop which can
            // take seconds. Errors are logged but do not drop the connection.
            args.onInbound(msg).catch((err) => {
              console.error(
                `[discord-native] ${args.accountId} inbound handler error:`,
                err instanceof Error ? err.message : err,
              )
            })
          }
          break
        }

        case 7:
        case 9: {
          // RECONNECT / INVALID_SESSION — close and let onclose handle it.
          console.warn(
            `[discord-native] ${args.accountId} op=${payload.op}, closing for reconnect`,
          )
          try { ws.close(4000, 'reconnect') } catch { /* ignore */ }
          break
        }
      }
    })

    ws.addEventListener('error', (event: Event) => {
      console.error(`[discord-native] ${args.accountId} ws error`, event)
    })

    ws.addEventListener('close', (event: { code: number; reason: string }) => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      console.log(
        `[discord-native] ${args.accountId} closed (${event.code}: ${event.reason || 'no reason'})`,
      )

      // Permanent close codes — Discord docs:
      //   4004 Authentication failed
      //   4010 Invalid shard
      //   4011 Sharding required
      //   4012 Invalid API version
      //   4013 Invalid intents
      //   4014 Disallowed intents
      const permanentCodes = new Set([4004, 4010, 4011, 4012, 4013, 4014])
      if (permanentCodes.has(event.code)) {
        if (!settled) {
          settled = true
          reject(new PermanentChannelError(
            `discord: gateway closed with code ${event.code} (${event.reason || 'permanent failure'})`,
          ))
        }
        return
      }

      // Transient close after handshake → let NativeChannelManager's
      // reconnect policy kick in via the normal error path. Manager will
      // restart the adapter on the next start cycle. We don't auto-reconnect
      // in-adapter because the manager owns lifecycle + governance.
      if (!settled) {
        settled = true
        reject(new Error(
          `discord: gateway closed during handshake (${event.code}: ${event.reason || 'unknown'})`,
        ))
      }
    })
  })
}
