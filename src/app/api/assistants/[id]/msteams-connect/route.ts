import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { FEATURES } from '@/lib/features'

export const dynamic = 'force-dynamic'

function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    request.nextUrl.origin
  )
}

export async function POST(
  request: NextRequest,
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

  if (!FEATURES.teamsHosted) {
    return NextResponse.json(
      {
        error: 'Microsoft Teams hosted connect is disabled on this deployment',
      },
      { status: 404 },
    )
  }

  return NextResponse.json({
    connectUrl: `${getBaseUrl(request)}/api/webhooks/msteams/oauth/install?assistant_id=${encodeURIComponent(id)}`,
  })
}
