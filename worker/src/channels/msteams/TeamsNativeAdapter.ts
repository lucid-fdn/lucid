/**
 * Microsoft Teams native channel adapter (C2a — dedicated runtime only).
 *
 * Implements `NativeChannelAdapter` for Teams BYOB bots. Unlike Discord/Slack
 * which use persistent WebSocket connections, Teams uses HTTP webhooks —
 * the adapter starts an Express listener to receive activity callbacks from
 * Bot Framework.
 *
 * ## Lifecycle contract (per `NativeChannelAdapter`)
 *
 *   start() resolves when the HTTP server is listening and ready for callbacks.
 *   start() rejects with `PermanentChannelError` if:
 *     - OAuth token acquisition returns 401/403 (invalid app credentials)
 *   After start() resolves, the server keeps running until `signal.aborted`.
 *   On abort, the adapter closes the HTTP server.
 *
 * ## Message routing
 *
 * Forwards to `handlers.onMessage(userId, chatId, text, threadId?)` when:
 *   - Activity type is 'message'
 *   - Text is non-empty after stripping <at>BotName</at> mention tags
 * Ignores non-message activities (conversationUpdate, typing, etc.)
 */

import express, { type Request, type Response } from 'express'
import type { Server } from 'http'
import { PermanentChannelError } from '../errors.js'
import type {
  NativeChannelAdapter,
  NativeChannelHandlers,
  NativeChannelStartParams,
} from '../native/adapter-registry.js'

const TEAMS_CHANNEL_TYPE = 'msteams'
const DEFAULT_WEBHOOK_PORT = 3978

interface TeamsActivity {
  type: string
  id: string
  serviceUrl?: string
  from?: { id: string; name?: string }
  conversation?: { id: string }
  recipient?: { id: string; name?: string }
  text?: string
  entities?: Array<{ type: string; mentioned?: { id: string }; text?: string }>
}

/**
 * Strip `<at>BotName</at>` mention tags from message text.
 */
function stripMentionTags(text: string): string {
  return text.replace(/<at>[^<]*<\/at>/gi, '').replace(/\s+/g, ' ').trim()
}

/**
 * Acquire an OAuth token from Azure AD for the Bot Framework.
 * Retries transient failures (5xx, network errors) up to 2 times with backoff.
 * Throws PermanentChannelError on 401/403 (invalid credentials).
 */
async function acquireToken(
  appId: string,
  appPassword: string,
  tenantId: string,
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: appId,
    client_secret: appPassword,
    scope: 'https://api.botframework.com/.default',
  })

  const maxRetries = 2
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      })

      if (res.status === 401 || res.status === 403) {
        throw new PermanentChannelError(
          `msteams: OAuth token acquisition failed (${res.status}) — app credentials invalid or revoked`,
        )
      }

      // Retry on 5xx
      if (res.status >= 500) {
        lastError = new Error(`msteams: OAuth token failed (${res.status})`)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
          continue
        }
        throw lastError
      }

      if (!res.ok) {
        throw new Error(`msteams: OAuth token failed (${res.status})`)
      }

      const data = await res.json() as { access_token?: string; error?: string }
      if (!data.access_token) {
        throw new Error(`msteams: OAuth token error: ${data.error || 'no access_token'}`)
      }

      return data.access_token
    } catch (err) {
      if (err instanceof PermanentChannelError) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError ?? new Error('msteams: OAuth token failed after retries')
}

/**
 * Send a reply via Bot Framework REST API.
 * Returns the fetch Response to allow caller to handle 401 retry.
 */
async function sendReplyRequest(
  serviceUrl: string,
  conversationId: string,
  text: string,
  replyToActivityId: string,
  token: string,
): Promise<globalThis.Response> {
  const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(replyToActivityId)}`

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: 'message', text }),
    signal: AbortSignal.timeout(15_000),
  })
}

/**
 * Classify a send response, throwing on permanent errors.
 */
function classifySendResponse(res: globalThis.Response): void {
  if (res.ok) return
  if (res.status === 403) {
    throw new PermanentChannelError(
      `msteams: send failed (403) — missing permissions`,
    )
  }
  if (res.status === 404) {
    throw new PermanentChannelError(
      `msteams: conversation not found (404)`,
    )
  }
}

export const teamsNativeAdapter: NativeChannelAdapter = {
  channelType: TEAMS_CHANNEL_TYPE,

  async start(
    params: NativeChannelStartParams,
    signal: AbortSignal,
    handlers: NativeChannelHandlers,
  ): Promise<void> {
    const appId = params.credentials.app_id
    const appPassword = params.credentials.app_password
    const tenantId = params.credentials.tenant_id || 'common'
    const webhookPort = parseInt(params.credentials.webhook_port || String(DEFAULT_WEBHOOK_PORT), 10)

    if (!appId || !appPassword) {
      throw new PermanentChannelError(
        `msteams: app credentials not configured for account ${params.accountId}`,
      )
    }

    if (isNaN(webhookPort) || webhookPort < 1 || webhookPort > 65535) {
      throw new PermanentChannelError(
        `msteams: invalid webhook port ${params.credentials.webhook_port} for account ${params.accountId}`,
      )
    }

    // Validate credentials by acquiring a token upfront.
    let token = await acquireToken(appId, appPassword, tenantId)
    let tokenExpiresAt = Date.now() + 3500_000 // ~58 min (tokens last ~1hr)

    // Token refresh helper
    const ensureToken = async (): Promise<string> => {
      if (Date.now() > tokenExpiresAt) {
        token = await acquireToken(appId, appPassword, tenantId)
        tokenExpiresAt = Date.now() + 3500_000
      }
      return token
    }

    // Start Express server for webhook callbacks
    const app = express()
    app.use(express.json())

    app.post('/api/messages', async (req: Request, res: Response) => {
      const activity = req.body as unknown as TeamsActivity

      // Return 200 immediately (Teams expects fast response)
      res.status(200).json({})

      if (activity.type !== 'message') return

      const rawText = activity.text || ''
      const cleanText = stripMentionTags(rawText)
      if (!cleanText) return

      const userId = activity.from?.id || 'unknown'
      const chatId = activity.conversation?.id || ''
      const serviceUrl = activity.serviceUrl || 'https://smba.trafficmanager.net/teams'

      try {
        const reply = await handlers.onMessage(userId, chatId, cleanText)

        if (reply && reply.trim().length > 0) {
          let currentToken = await ensureToken()
          let sendRes = await sendReplyRequest(serviceUrl, chatId, reply, activity.id, currentToken)

          // On 401, token may have expired — refresh and retry once
          if (sendRes.status === 401) {
            token = await acquireToken(appId, appPassword, tenantId)
            tokenExpiresAt = Date.now() + 3500_000
            currentToken = token
            sendRes = await sendReplyRequest(serviceUrl, chatId, reply, activity.id, currentToken)
          }

          // After retry, classify errors
          classifySendResponse(sendRes)
          if (!sendRes.ok) {
            const errText = await sendRes.text().catch(() => '')
            throw new Error(`msteams: send failed (${sendRes.status}): ${errText.slice(0, 200)}`)
          }
        }
      } catch (err) {
        console.error(
          `[teams-native] ${params.accountId} handler error:`,
          err instanceof Error ? err.message : err,
        )
      }
    })

    // Health endpoint
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', adapter: 'msteams', account: params.accountId })
    })

    return new Promise<void>((resolve, reject) => {
      let server: Server | null = null

      const cleanup = (): void => {
        if (server) {
          server.close()
          server = null
        }
      }

      const onAbort = (): void => {
        console.log(`[teams-native] ${params.accountId} shutting down`)
        cleanup()
      }
      signal.addEventListener('abort', onAbort, { once: true })

      try {
        server = app.listen(webhookPort, () => {
          console.log(
            `[teams-native] ${params.accountId} listening on port ${webhookPort}`,
          )
          resolve()
        })

        server.on('error', (err: Error) => {
          console.error(`[teams-native] ${params.accountId} server error:`, err.message)
          cleanup()
          reject(err)
        })
      } catch (err) {
        reject(err)
      }
    })
  },
}
