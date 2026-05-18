import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getUserOrganizations } from '@/lib/db/organizations'
import { supabase } from '@/lib/db/client'
import { summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'mylclaw_bot'

/**
 * POST /api/telegram/link-token
 *
 * Generate a one-time token that links a Telegram account to the
 * authenticated user's LucidMerged profile + org.
 *
 * Returns: { token, deep_link, expires_in_minutes }
 *
 * The user opens the deep_link in Telegram, which sends /start link_TOKEN
 * to the bot. The bot consumes the token and links the accounts.
 */
export async function POST(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's primary org (first one they belong to)
  const orgs = await getUserOrganizations(userId)
  if (!orgs || orgs.length === 0) {
    return NextResponse.json(
      { error: 'No organization found for user' },
      { status: 400 },
    )
  }

  // Use the first org (personal workspace)
  const org = (orgs[0] as Record<string, unknown>).organization as Record<string, unknown> | null
  if (!org?.id) {
    return NextResponse.json(
      { error: 'Organization data missing' },
      { status: 500 },
    )
  }
  const orgId = String(org.id)

  // Optionally accept org_id from body to link to a specific org
  let targetOrgId = orgId
  try {
    const body = await request.json().catch(() => ({}))
    if (body.org_id && typeof body.org_id === 'string') {
      // Verify user is a member of the requested org
      const isMember = orgs.some((o: Record<string, unknown>) => {
        const memberOrg = o.organization as Record<string, unknown> | null
        return memberOrg && String(memberOrg.id) === body.org_id
      })
      if (isMember) {
        targetOrgId = body.org_id
      }
    }
  } catch {
    // Ignore body parse errors — use default org
  }

  // Generate token via RPC
  const { data: token, error } = await supabase.rpc('create_telegram_link_token', {
    p_profile_id: userId,
    p_org_id: targetOrgId,
    p_ttl_minutes: 15,
  })

  if (error || !token) {
    console.error('[telegram-link] RPC failed:', summarizeError(error))
    return NextResponse.json(
      { error: 'Failed to generate link token' },
      { status: 500 },
    )
  }

  const deepLink = `https://t.me/${BOT_USERNAME}?start=link_${token}`

  return NextResponse.json({
    token,
    deep_link: deepLink,
    expires_in_minutes: 15,
  })
}
