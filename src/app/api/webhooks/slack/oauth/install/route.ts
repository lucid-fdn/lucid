import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { getOrgMemberRole } from '@/lib/db/organizations'
import { ErrorService } from '@/lib/errors/error-service'
import { FEATURES } from '@/lib/features'
import { issueSlackOAuthState } from '@/lib/slack/oauth-state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVILEGED_ROLES = new Set(['owner', 'admin'])
const DEFAULT_SLACK_HOSTED_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'chat:write',
  'chat:write.customize',
  'commands',
  'files:read',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'im:write',
  'mpim:read',
  'mpim:write',
  'reactions:write',
]

function getAppBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    request.nextUrl.origin
  )
}

function getSlackOAuthRedirectBaseUrl(request: NextRequest): string {
  return process.env.SLACK_HOSTED_REDIRECT_BASE_URL?.trim() || getAppBaseUrl(request)
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function buildSlackHostedInstallUrl(
  request: NextRequest,
): { url: string | null; error: string | null } {
  const explicitUrl = process.env.SLACK_HOSTED_INSTALL_URL
  if (explicitUrl) {
    return { url: explicitUrl, error: null }
  }

  const clientId = process.env.SLACK_HOSTED_CLIENT_ID
  if (!clientId) {
    return {
      url: null,
      error:
        'Slack hosted install is not configured. Set SLACK_HOSTED_CLIENT_ID or SLACK_HOSTED_INSTALL_URL.',
    }
  }

  const baseUrl = getSlackOAuthRedirectBaseUrl(request)
  if (!isHttpsUrl(baseUrl)) {
    return {
      url: null,
      error:
        'Slack hosted install needs a public HTTPS callback URL. Set SLACK_HOSTED_REDIRECT_BASE_URL to an HTTPS tunnel URL, or use the deployed Lucid site.',
    }
  }
  const redirectUri = `${baseUrl}/api/webhooks/slack/oauth/callback`
  const rawScopes = process.env.SLACK_HOSTED_SCOPES
  const scopes = (rawScopes
    ? rawScopes.split(',').map((scope) => scope.trim()).filter(Boolean)
    : DEFAULT_SLACK_HOSTED_SCOPES
  ).join(',')

  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('redirect_uri', redirectUri)

  return { url: url.toString(), error: null }
}

export async function GET(request: NextRequest) {
  try {
    if (!FEATURES.slackHosted) {
      return NextResponse.json({ error: 'Slack hosted install is disabled' }, { status: 404 })
    }

    const { url: installUrl, error: installError } = buildSlackHostedInstallUrl(request)
    if (!installUrl) {
      return NextResponse.json(
        { error: installError || 'Slack hosted install is unavailable.' },
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

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const role = await getOrgMemberRole(userId, assistant.org_id)
    if (!role || !PRIVILEGED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Owner or admin role required' }, { status: 403 })
    }

    const state = issueSlackOAuthState({
      assistantId,
      orgId: assistant.org_id,
      userId,
    })

    const url = new URL(installUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('assistant_id', assistantId)

    return NextResponse.redirect(url.toString())
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/slack/oauth/install', method: 'GET' },
      tags: { layer: 'api', route: 'slack-hosted-install' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
