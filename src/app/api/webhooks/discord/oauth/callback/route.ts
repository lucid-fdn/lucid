/**
 * Hosted Discord OAuth install — callback.
 *
 * Discord redirects here after the user picks a guild in the install dialog.
 * We must:
 *
 *   1. Extract `code`, `state`, `guild_id` from the query string.
 *   2. Verify the signed state token — bad/expired/forged → 400.
 *   3. Confirm the Lucid session user matches the user who initiated the
 *      install. Stolen callback URLs pasted into another tab must not bind
 *      somebody else's agent.
 *   4. Exchange `code` → bot token via Discord's OAuth endpoint. The response
 *      includes a `guild` object (since scope=bot); `guild.id` is the
 *      canonical source — we trust that over the query string `guild_id`
 *      because Discord signs the token exchange, not the redirect params.
 *   5. Call `bindAgentToGuildViaShare(assistantId, guildId)`.
 *   6. Register per-guild slash commands via the bot token. Done last so a
 *      registration failure doesn't leave a dangling binding.
 *   7. 302 the user back to the Studio assistant detail page with a
 *      success/error toast param.
 *
 * Spec: docs/plans/2026-04-08-discord-byob-and-shared-bot.md §2b
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { bindAgentToGuildViaShare, getAssistant, updateDiscordGuildMetadata } from '@/lib/db'
import { getOrganizationById } from '@/lib/db/organizations'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { ErrorService } from '@/lib/errors/error-service'
import { verifyDiscordOAuthState } from '@/lib/discord/oauth-state'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import { registerGuildCommands } from '@/lib/discord/guild-commands'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token'

function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    request.nextUrl.origin
  )
}

function isLocalLoopbackRequest(request: NextRequest): boolean {
  const hostname = request.nextUrl.hostname
  return (
    process.env.NODE_ENV !== 'production' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  )
}

/**
 * Build the Studio detail URL we 302 the user back to. We always route
 * through the workspace-scoped path so the user lands on the same sidebar
 * tree they started from. Falls back to `/dashboard` if the org has no
 * slug (shouldn't happen in practice — orgs are slug'd at creation).
 */
async function buildReturnUrl(
  baseUrl: string,
  orgSlug: string | null,
  assistantId: string,
  orgId: string,
  toast: { type: 'success' | 'error'; message: string },
): Promise<string> {
  const params = new URLSearchParams({
    toast: toast.type,
    toast_msg: toast.message,
  })
  if (!orgSlug) {
    return `${baseUrl}/dashboard?${params.toString()}`
  }

  const assistant = await getAssistant(assistantId)
  if (!assistant || assistant.org_id !== orgId || !assistant.project_id) {
    return `${baseUrl}/${orgSlug}/projects?${params.toString()}`
  }

  const project = await getProjectByIdForWorkspace(orgId, assistant.project_id)
  if (!project) {
    return `${baseUrl}/${orgSlug}/projects?${params.toString()}`
  }

  return `${baseUrl}${buildProjectAgentDetailPath(orgSlug, project.slug, assistantId)}?${params.toString()}`
}

function buildPopupCompletionResponse(params: {
  baseUrl: string
  returnUrl: string
  level: 'success' | 'error'
  message: string
}) {
  const payload = JSON.stringify({
    type: 'discord-install-result',
    level: params.level,
    message: params.message,
  }).replace(/</g, '\\u003c')

  const fallbackUrl = JSON.stringify(params.returnUrl)
  const baseOrigin = JSON.stringify(params.baseUrl)

  return new NextResponse(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Discord install</title>
  </head>
  <body>
    <script>
      (function () {
        const payload = ${payload};
        const fallbackUrl = ${fallbackUrl};
        const targetOrigin = ${baseOrigin};

        try {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(payload, targetOrigin);
              window.close();
              return;
            } catch (postMessageError) {
              console.error('discord popup handoff failed', postMessageError);
            }

            try {
              window.opener.location.replace(fallbackUrl);
              window.close();
              return;
            } catch (openerRedirectError) {
              console.error('discord opener redirect failed', openerRedirectError);
            }
          }
        } catch (error) {
          console.error('discord popup handoff failed', error);
        }

        window.location.replace(fallbackUrl);
      })();
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )
}

interface DiscordTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  guild?: { id?: string; name?: string }
}

async function exchangeCodeForGuild(params: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}): Promise<{ ok: true; guildId: string; guildName: string | null } | { ok: false; error: string }> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  })

  let res: Response
  try {
    res = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (error) {
    return { ok: false, error: `network: ${(error as Error).message}` }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { ok: false, error: `discord ${res.status}: ${txt.slice(0, 200)}` }
  }

  let parsed: DiscordTokenResponse
  try {
    parsed = (await res.json()) as DiscordTokenResponse
  } catch {
    return { ok: false, error: 'invalid json' }
  }

  const guildId = parsed.guild?.id
  if (!guildId || typeof guildId !== 'string') {
    return { ok: false, error: 'missing guild in token response' }
  }
  const guildName =
    typeof parsed.guild?.name === 'string' && parsed.guild.name.trim().length > 0
      ? parsed.guild.name.trim()
      : null
  return { ok: true, guildId, guildName }
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request)

  try {
    const clientId = process.env.DISCORD_HOSTED_CLIENT_ID
    const clientSecret = process.env.DISCORD_HOSTED_CLIENT_SECRET
    const botToken = process.env.DISCORD_HOSTED_BOT_TOKEN
    if (!clientId || !clientSecret) {
      console.error('[DISCORD-CALLBACK] ❌ Hosted bot credentials not set')
      return NextResponse.json(
        { error: 'Discord hosted bot is not configured on this deployment.' },
        { status: 503 },
      )
    }

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const discordError = searchParams.get('error')

    // The user clicked "Cancel" on Discord's install dialog.
    if (discordError) {
      console.warn(`[DISCORD-CALLBACK] user cancelled: ${discordError}`)
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl: `${baseUrl}/dashboard?toast=error&toast_msg=${encodeURIComponent('Discord install cancelled.')}`,
        level: 'error',
        message: 'Discord install cancelled.',
      })
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state' },
        { status: 400 },
      )
    }

    // 1. Verify state token (signed + unexpired).
    const payload = verifyDiscordOAuthState(state)
    if (!payload) {
      console.warn('[DISCORD-CALLBACK] Invalid or expired OAuth state')
      return NextResponse.json(
        { error: 'Invalid or expired install link. Please restart the install.' },
        { status: 400 },
      )
    }

    // 2. Session binding — the session that completes must match the
    // session that initiated. Prevents a stolen callback URL from binding
    // somebody else's agent to a guild.
    const sessionUserId = await getUserId()
    const allowLocalDevSessionBypass = isLocalLoopbackRequest(request)
    if ((!sessionUserId || sessionUserId !== payload.userId) && !allowLocalDevSessionBypass) {
      console.warn('[DISCORD-CALLBACK] OAuth user mismatch', {
        sessionUserId: maskIdentifier(sessionUserId),
        stateUserId: maskIdentifier(payload.userId),
      })
      return NextResponse.json(
        { error: 'Please log in as the user who started the install, then try again.' },
        { status: 401 },
      )
    }
    if ((!sessionUserId || sessionUserId !== payload.userId) && allowLocalDevSessionBypass) {
      console.warn('[DISCORD-CALLBACK] Local dev OAuth user mismatch bypassed')
    }

    // 3. Exchange code → token → guild id.
    const redirectUri = `${baseUrl}/api/webhooks/discord/oauth/callback`
    const exchange = await exchangeCodeForGuild({
      clientId,
      clientSecret,
      code,
      redirectUri,
    })
    if (!exchange.ok) {
      console.error('[DISCORD-CALLBACK] OAuth exchange failed:', summarizeError(exchange.error))
      const org = await getOrganizationById(payload.orgId)
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'error',
        message: 'Could not complete Discord install. Please try again.',
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'error',
        message: 'Could not complete Discord install. Please try again.',
      })
    }
    const guildId = exchange.guildId
    const guildName = exchange.guildName

    // 4. Resolve org slug for the return URL up front — we'll need it
    // regardless of whether the bind succeeds.
    const [assistant, org] = await Promise.all([
      getAssistant(payload.assistantId),
      getOrganizationById(payload.orgId),
    ])
    if (!assistant || assistant.org_id !== payload.orgId) {
      // The agent was deleted or moved between install start and callback.
      return NextResponse.redirect(
        await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
          type: 'error',
          message: 'Assistant not found. It may have been deleted.',
        }),
      )
    }

    // 5. Bind the agent to the guild.
    const bind = await bindAgentToGuildViaShare({
      assistantId: payload.assistantId,
      guildId,
    })
    if (!bind.ok) {
      const msg =
        bind.error === 'agent_not_found'
          ? 'Assistant not found. It may have been deleted.'
          : 'Could not bind the agent to your server. Please try again.'
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'error',
        message: msg,
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'error',
        message: msg,
      })
    }

    await updateDiscordGuildMetadata({
      channelId: bind.channelId,
      guildId,
      guildName,
    })

    // 6. Register per-guild slash commands when the hosted bot token is
    // available. If this fails we DO NOT unbind — the binding is still useful,
    // and operators can retry registration later after finishing Discord app
    // setup.
    if (botToken) {
      try {
        await registerGuildCommands({ clientId, botToken, guildId })
      } catch (error) {
        console.error('[DISCORD-CALLBACK] Guild command registration failed:', summarizeError(error))
        ErrorService.captureException(error as Error, {
          severity: 'warning',
          context: {
            endpoint: '/api/webhooks/discord/oauth/callback',
            phase: 'register_commands',
            guildId,
            assistantId: payload.assistantId,
          },
          tags: { layer: 'api', route: 'discord-hosted-callback' },
        })
        const message = 'Bot installed, but slash commands failed to register. Try /help in Discord to refresh.'
        const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
          type: 'success',
          message,
        })
        return buildPopupCompletionResponse({
          baseUrl,
          returnUrl,
          level: 'success',
          message,
        })
      }
    } else {
      console.warn('[DISCORD-CALLBACK] Hosted Discord app credential is not configured; skipping guild command registration')
      const message = 'Bot installed. Slash commands will appear after hosted Discord app configuration is completed.'
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'success',
        message,
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'success',
        message,
      })
    }

    // 7. All done — send the user back to the Studio agent detail with a
    // success toast.
    const message = 'Installed on Discord. Run /agents in your server to pick the active agent.'
    const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
      type: 'success',
      message,
    })
    return buildPopupCompletionResponse({
      baseUrl,
      returnUrl,
      level: 'success',
      message,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/discord/oauth/callback', method: 'GET' },
      tags: { layer: 'api', route: 'discord-hosted-callback' },
    })
    const message = 'Discord install failed. Please try again.'
    return buildPopupCompletionResponse({
      baseUrl,
      returnUrl: `${baseUrl}/dashboard?toast=error&toast_msg=${encodeURIComponent(message)}`,
      level: 'error',
      message,
    })
  }
}
