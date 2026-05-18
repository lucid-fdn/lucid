import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { encryptChannelSecrets } from '@/lib/channels/secrets'
import { getAssistant } from '@/lib/db'
import { getOrganizationById } from '@/lib/db/organizations'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { ErrorService } from '@/lib/errors/error-service'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import { verifySlackOAuthState } from '@/lib/slack/oauth-state'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    request.nextUrl.origin
  )
}

function getSlackOAuthRedirectBaseUrl(request: NextRequest): string {
  return process.env.SLACK_HOSTED_REDIRECT_BASE_URL?.trim() || getBaseUrl(request)
}

function buildLoginRedirectUrl(request: NextRequest, baseUrl: string): string {
  const loginUrl = new URL('/login', baseUrl)
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  loginUrl.searchParams.set('next', next)
  return loginUrl.toString()
}

async function buildReturnUrl(
  baseUrl: string,
  orgSlug: string | null,
  assistantId: string,
  orgId: string,
  toast: { type: 'success' | 'error'; message: string },
  options?: { openChannelModal?: boolean; channelType?: string; connectionMode?: 'byob' | 'hosted' },
): Promise<string> {
  const params = new URLSearchParams({
    toast: toast.type,
    toast_msg: toast.message,
  })
  if (options?.openChannelModal) {
    params.set('channel_modal', '1')
    if (options.channelType) params.set('channel_type', options.channelType)
    if (options.connectionMode) params.set('connection_mode', options.connectionMode)
  }
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
    type: 'slack-install-result',
    level: params.level,
    message: params.message,
  }).replace(/</g, '\\u003c')

  const fallbackUrl = JSON.stringify(params.returnUrl)
  const targetOrigin = JSON.stringify(params.baseUrl)

  return new NextResponse(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Slack install</title>
  </head>
  <body>
    <script>
      (function () {
        const payload = ${payload};
        const fallbackUrl = ${fallbackUrl};
        const targetOrigin = ${targetOrigin};

        try {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(payload, targetOrigin);
              window.close();
              return;
            } catch (postMessageError) {
              console.error('slack popup handoff failed', postMessageError);
            }

            try {
              window.opener.location.replace(fallbackUrl);
              window.close();
              return;
            } catch (openerRedirectError) {
              console.error('slack opener redirect failed', openerRedirectError);
            }
          }
        } catch (error) {
          console.error('slack popup handoff failed', error);
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

interface SlackOAuthResponse {
  ok?: boolean
  access_token?: string
  team?: { id?: string; name?: string }
  bot_user_id?: string
  error?: string
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = getBaseUrl(request)
    const redirectBaseUrl = getSlackOAuthRedirectBaseUrl(request)
    const state = request.nextUrl.searchParams.get('state')
    const code = request.nextUrl.searchParams.get('code')
    const slackError = request.nextUrl.searchParams.get('error')
    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 })
    }

    const payload = verifySlackOAuthState(state)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 })
    }

    const sessionUserId = await getUserId()
    if (!sessionUserId) {
      return NextResponse.redirect(buildLoginRedirectUrl(request, baseUrl))
    }

    if (sessionUserId !== payload.userId) {
      return NextResponse.json(
        { error: 'Please log in as the user who started the install.' },
        { status: 401 },
      )
    }

    const org = await getOrganizationById(payload.orgId)

    if (slackError) {
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'error',
        message: 'Slack install cancelled.',
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'error',
        message: 'Slack install cancelled.',
      })
    }

    if (!code) {
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'error',
        message: 'Slack install did not return an authorization code.',
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'error',
        message: 'Slack install did not return an authorization code.',
      })
    }

    const clientId = process.env.SLACK_HOSTED_CLIENT_ID
    const clientSecret = process.env.SLACK_HOSTED_CLIENT_SECRET
    const appToken = process.env.SLACK_HOSTED_APP_TOKEN
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!clientId || !clientSecret || !appToken || !encryptionKey) {
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'error',
        message: 'Slack hosted install is not fully configured on this deployment.',
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'error',
        message: 'Slack hosted install is not fully configured on this deployment.',
      })
    }

    const redirectUri = `${redirectBaseUrl}/api/webhooks/slack/oauth/callback`
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    })

    const tokenData = (await tokenRes.json().catch(() => null)) as SlackOAuthResponse | null
    if (!tokenRes.ok || !tokenData?.ok || !tokenData.access_token || !tokenData.team?.id) {
      const message = `Slack install failed${tokenData?.error ? `: ${tokenData.error}` : '.'}`
      const returnUrl = await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'error',
        message,
      })
      return buildPopupCompletionResponse({
        baseUrl,
        returnUrl,
        level: 'error',
        message,
      })
    }

    const supabase = createServiceClient()
    const encryptedSecrets = encryptChannelSecrets(
      {
        bot_token: tokenData.access_token,
        app_token: appToken,
        team_id: tokenData.team.id,
        ...(tokenData.bot_user_id ? { bot_user_id: tokenData.bot_user_id } : {}),
      },
      encryptionKey,
    )

    const { data: secretsRow, error: secretsError } = await supabase
      .from('encrypted_secrets')
      .insert({ encrypted_data: encryptedSecrets })
      .select('id')
      .single()

    if (secretsError || !secretsRow) {
      throw secretsError || new Error('Failed to persist Slack hosted secrets')
    }

    const pendingConfig = {
      hosted: true,
      pending_bind: false,
      install_status: 'installed_unbound',
      slack_team_id: tokenData.team.id,
      slack_team_name: tokenData.team.name || null,
      installed_via: 'oauth',
    }

    const { data: existing } = await supabase
      .from('assistant_channels')
      .select('id')
      .eq('assistant_id', payload.assistantId)
      .eq('channel_type', 'slack')
      .eq('connection_mode', 'hosted')
      .maybeSingle()

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('assistant_channels')
        .update({
          encrypted_secrets_id: secretsRow.id,
          channel_config: pendingConfig,
          external_channel_id: null,
          is_active: false,
          is_primary: false,
        })
        .eq('id', existing.id)
      if (updateError) {
        throw updateError
      }
    } else {
      const { error: insertError } = await supabase
        .from('assistant_channels')
        .insert({
          assistant_id: payload.assistantId,
          channel_type: 'slack',
          secret_token_hash: crypto.randomUUID(),
          encrypted_secrets_id: secretsRow.id,
          external_channel_id: null,
          webhook_url: null,
          is_active: false,
          channel_config: pendingConfig,
          connection_mode: 'hosted',
          inbound_routing_config: {},
          is_primary: false,
        })
      if (insertError) {
        throw insertError
      }
    }

    const successMessage =
      'Slack installed. Open the Lucid app in Slack to choose a DM or channel, or run /lucid bind where this agent should be active.'
    const returnUrl = await buildReturnUrl(
      baseUrl,
      org?.slug ?? null,
      payload.assistantId,
      payload.orgId,
      {
        type: 'success',
        message: successMessage,
      },
      {
        openChannelModal: true,
        channelType: 'slack',
        connectionMode: 'hosted',
      },
    )
    return buildPopupCompletionResponse({
      baseUrl,
      returnUrl,
      level: 'success',
      message: successMessage,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/slack/oauth/callback', method: 'GET' },
      tags: { layer: 'api', route: 'slack-hosted-callback' },
    })
    const baseUrl = getBaseUrl(request)
    const message = 'Slack install failed. Please try again.'
    return buildPopupCompletionResponse({
      baseUrl,
      returnUrl: `${baseUrl}/dashboard?toast=error&toast_msg=${encodeURIComponent(message)}`,
      level: 'error',
      message,
    })
  }
}
