import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { FEATURES } from '@/lib/features'

export const dynamic = 'force-dynamic'

function getHostedBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    request.nextUrl.origin
  )
}

function getSlackHostedRedirectBaseUrl(request: NextRequest): string {
  return process.env.SLACK_HOSTED_REDIRECT_BASE_URL?.trim() || getHostedBaseUrl(request)
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const assistant = await getAssistant(id)
  if (!assistant) {
    return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
  }

  const isMember = await isUserOrgMember(userId, assistant.org_id)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!FEATURES.slackHosted) {
    return NextResponse.json(
      {
        error: 'Slack hosted connect is disabled on this deployment',
        details:
          'Enable FEATURE_SLACK_HOSTED and configure the SLACK_HOSTED_* deployment variables to use the shared Lucid Slack app.',
      },
      { status: 501 },
    )
  }

  const redirectBaseUrl = getSlackHostedRedirectBaseUrl(_request)
  if (!isHttpsUrl(redirectBaseUrl)) {
    return NextResponse.json(
      {
        error: 'Slack hosted connect requires a public HTTPS callback URL',
        details:
          'Slack OAuth does not allow http://localhost callbacks. Use the deployed Lucid site or set SLACK_HOSTED_REDIRECT_BASE_URL to an HTTPS tunnel URL before testing Slack connect locally.',
      },
      { status: 503 },
    )
  }

  const origin = getHostedBaseUrl(_request)
  return NextResponse.json({
    connectUrl: `${origin}/api/webhooks/slack/oauth/install?assistant_id=${encodeURIComponent(id)}`,
  })
}
