import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { getOrgMemberRole } from '@/lib/db/organizations'
import { ErrorService } from '@/lib/errors/error-service'
import { FEATURES } from '@/lib/features'
import { issueTeamsOAuthState } from '@/lib/msteams/oauth-state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVILEGED_ROLES = new Set(['owner', 'admin'])

export async function GET(request: NextRequest) {
  try {
    if (!FEATURES.teamsHosted) {
      return NextResponse.json({ error: 'Microsoft Teams hosted install is disabled' }, { status: 404 })
    }

    const installUrl = process.env.MSTEAMS_HOSTED_INSTALL_URL
    if (!installUrl) {
      return NextResponse.json(
        { error: 'MSTEAMS_HOSTED_INSTALL_URL is not configured' },
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

    const state = issueTeamsOAuthState({
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
      context: { endpoint: '/api/webhooks/msteams/oauth/install', method: 'GET' },
      tags: { layer: 'api', route: 'msteams-hosted-install' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
