/**
 * Slack native channel adapter (C2a — dedicated runtime only).
 *
 * Implements `NativeChannelAdapter` for BYOB Slack bots. Each `start()` call
 * binds one bot to one assistant, connects via Socket Mode (WebSocket), and
 * replies via the Slack Web API. The runtime owns the tokens — control plane
 * never sees them.
 *
 * ## Why @slack/bolt Socket Mode instead of wrapping monitorSlackProvider
 *
 * OpenClaw's `monitorSlackProvider()` is 520 LOC deeply coupled to OpenClaw's
 * config system, runtime env, session management, and allowlists. For C2a we
 * need the exact same thin pattern as Discord: connect, listen, reply. Using
 * `@slack/bolt` in Socket Mode directly keeps us at ~100 LOC with zero
 * OpenClaw internal coupling.
 *
 * ## Lifecycle contract (per `NativeChannelAdapter`)
 *
 *   start() resolves when the Bolt app is connected via Socket Mode.
 *   start() rejects with `PermanentChannelError` if:
 *     - Bot token auth test fails (invalid_auth, not_authed, token_revoked)
 *     - App token is missing or invalid for Socket Mode
 *   After start() resolves, the connection keeps running until `signal.aborted`.
 *   On abort, the adapter stops the Bolt app and cleans up.
 *
 * ## Message routing
 *
 * Forwards to `handlers.onMessage(userId, chatId, text, threadTs?)` when:
 *   - Direct message to the bot, OR
 *   - Bot is @mentioned in a channel, OR
 *   - Message is in a channel where the bot is invited (app_mention event)
 * Ignores bot messages and empty content after mention-stripping.
 */

import { PermanentChannelError } from '../errors.js'
import type {
  NativeChannelAdapter,
  NativeChannelHandlers,
  NativeChannelStartParams,
} from '../native/adapter-registry.js'

const SLACK_CHANNEL_TYPE = 'slack'

/** Slack auth errors that indicate permanently revoked/invalid credentials. */
const PERMANENT_AUTH_ERRORS = new Set([
  'not_authed',
  'invalid_auth',
  'account_inactive',
  'token_revoked',
  'token_expired',
  'missing_scope',
  'invalid_token',
])

export const slackNativeAdapter: NativeChannelAdapter = {
  channelType: SLACK_CHANNEL_TYPE,

  async start(
    params: NativeChannelStartParams,
    signal: AbortSignal,
    handlers: NativeChannelHandlers,
  ): Promise<void> {
    const botToken = params.credentials.bot_token
    const appToken = params.credentials.app_token

    if (!botToken) {
      throw new PermanentChannelError(
        `slack: bot_token not configured for account ${params.accountId}`,
      )
    }
    if (!appToken) {
      throw new PermanentChannelError(
        `slack: app_token required for Socket Mode — not configured for account ${params.accountId}`,
      )
    }

    // Lazy-import @slack/bolt to keep the module out of the critical path
    // when Slack adapters aren't used.
    const { App, LogLevel } = await import('@slack/bolt')

    let botUserId: string | null = null

    const app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      logLevel: LogLevel.ERROR,
    })

    // Listen for messages — both DMs and channel messages where bot is present
    app.message(async ({ message, say }) => {
      // Skip bot messages and message_changed/deleted subtypes
      if (
        !message ||
        ('subtype' in message && message.subtype != null) ||
        !('text' in message) ||
        !('user' in message)
      ) {
        return
      }

      const msg = message as {
        user: string
        text: string
        channel: string
        ts: string
        thread_ts?: string
        channel_type?: string
      }

      // Skip our own messages
      if (botUserId && msg.user === botUserId) return

      let text = msg.text ?? ''

      // Strip @mention of our bot
      if (botUserId) {
        text = text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim()
      }
      if (!text) return

      const reply = await handlers.onMessage(
        msg.user,
        msg.channel,
        text,
        msg.thread_ts,
      )

      if (reply && reply.trim().length > 0) {
        try {
          await say({
            text: reply,
            thread_ts: msg.thread_ts ?? msg.ts,
          })
        } catch (err) {
          console.error(
            `[slack-native] ${params.accountId} reply failed:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
    })

    // Also listen for app_mention events (when bot is @mentioned in channels)
    app.event('app_mention', async ({ event, say }) => {
      const msg = event as {
        user: string
        text: string
        channel: string
        ts: string
        thread_ts?: string
      }

      let text = msg.text ?? ''
      if (botUserId) {
        text = text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim()
      }
      if (!text) return

      const reply = await handlers.onMessage(
        msg.user,
        msg.channel,
        text,
        msg.thread_ts,
      )

      if (reply && reply.trim().length > 0) {
        try {
          await say({
            text: reply,
            thread_ts: msg.thread_ts ?? msg.ts,
          })
        } catch (err) {
          console.error(
            `[slack-native] ${params.accountId} reply failed:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
    })

    // Start the app (connects Socket Mode WebSocket)
    try {
      await app.start()

      // Get our bot user ID for mention stripping
      try {
        const authResult = await app.client.auth.test({ token: botToken })
        botUserId = (authResult.user_id as string) ?? null
      } catch {
        // Non-fatal — mention stripping just won't work
      }

      console.log(`[slack-native] ${params.accountId} connected via Socket Mode`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // Check for permanent auth failures
      for (const authErr of PERMANENT_AUTH_ERRORS) {
        if (errMsg.includes(authErr)) {
          throw new PermanentChannelError(
            `slack: ${authErr} — bot token or app token invalid for account ${params.accountId}`,
          )
        }
      }
      throw err
    }

    // Handle abort signal — graceful shutdown
    const onAbort = () => {
      console.log(`[slack-native] ${params.accountId} shutting down`)
      app.stop().catch((err) => {
        console.error(
          `[slack-native] ${params.accountId} stop error:`,
          err instanceof Error ? err.message : err,
        )
      })
    }

    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  },
}
