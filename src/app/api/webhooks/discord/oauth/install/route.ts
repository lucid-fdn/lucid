/**
 * Hosted Discord OAuth install — entry point.
 *
 * Flow:
 *   1. User clicks "Install on Discord" in the Studio DiscordSharePanel.
 *   2. Browser hits `GET /api/webhooks/discord/oauth/install?assistant_id=...`.
 *   3. Route verifies session and owner/admin role.
 *   4. Route issues a signed state token binding (assistantId, orgId, userId)
 *      with a 10-minute expiry, then 302-redirects to Discord's OAuth dialog
 *      with `scope=bot applications.commands` and a minimal bot permission
 *      bitfield.
 *   5. Discord bounces back to `/api/webhooks/discord/oauth/callback` with
 *      `code`, `state`, and `guild_id`.
 *
 * The state token is the only CSRF defense — do not accept a callback that
 * doesn't carry a signature we issued AND that doesn't match the current
 * session user. See `oauth-state.ts` for the token format.
 *
 * Spec: docs/plans/2026-04-08-discord-byob-and-shared-bot.md §2b
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { getOrgMemberRole } from '@/lib/db/organizations'
import { ErrorService } from '@/lib/errors/error-service'
import { issueDiscordOAuthState } from '@/lib/discord/oauth-state'
import { summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVILEGED_ROLES = new Set(['owner', 'admin'])

/**
 * Minimum bot permissions: View Channels + Send Messages + Read Message History.
 *   - View Channels:       0x00000400 (1024)
 *   - Send Messages:       0x00000800 (2048)
 *   - Read Message History: 0x00010000 (65536)
 * Total: 68608. Using the numeric literal so operators can diff it against
 * Discord's permission calculator without needing to run bitshifts.
 */
const BOT_PERMISSIONS = '68608'
const OAUTH_SCOPES = 'bot applications.commands'
const DISCORD_AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize'

function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    request.nextUrl.origin
  )
}

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.DISCORD_HOSTED_CLIENT_ID
    if (!clientId) {
      console.error('[DISCORD-INSTALL] ❌ DISCORD_HOSTED_CLIENT_ID not set')
      return NextResponse.json(
        { error: 'Discord hosted bot is not configured on this deployment.' },
        { status: 503 },
      )
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const assistantId = request.nextUrl.searchParams.get('assistant_id')
    if (!assistantId) {
      return NextResponse.json({ error: 'Missing assistant_id' }, { status: 400 })
    }

    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }
    if (!assistant.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Installing the bot into a guild mutates shared state (the org's agent
    // becomes reachable by a whole server). Treat it as privileged.
    const role = await getOrgMemberRole(userId, assistant.org_id)
    if (!role || !PRIVILEGED_ROLES.has(role)) {
      return NextResponse.json(
        { error: 'Owner or admin role required' },
        { status: 403 },
      )
    }

    // Issue the signed OAuth state BEFORE redirecting. If the env is
    // misconfigured (missing DISCORD_HOSTED_STATE_SECRET) this throws —
    // surface it as a 500 rather than sending the user to Discord with a
    // bogus state.
    let state: string
    try {
      state = issueDiscordOAuthState({
        assistantId,
        orgId: assistant.org_id,
        userId,
      })
    } catch (error) {
      console.error('[DISCORD-INSTALL] Failed to issue OAuth state:', summarizeError(error))
      return NextResponse.json(
        { error: 'Discord install is not configured. Contact support.' },
        { status: 503 },
      )
    }

    const redirectUri = `${getBaseUrl(request)}/api/webhooks/discord/oauth/callback`

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: OAUTH_SCOPES,
      permissions: BOT_PERMISSIONS,
      redirect_uri: redirectUri,
      state,
      // Default OAuth picker to the "add bot to server" flow.
      integration_type: '0',
    })

    return NextResponse.redirect(`${DISCORD_AUTHORIZE_URL}?${params.toString()}`)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/discord/oauth/install', method: 'GET' },
      tags: { layer: 'api', route: 'discord-hosted-install' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
