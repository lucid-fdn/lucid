import { NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { supabase } from '@/lib/db/client'
import { FEATURES } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * GET /api/launchpad/my-assistants
 *
 * Returns the authenticated user's ai_assistants across all their orgs,
 * excluding any that have already been launched (launched_agents has a
 * UNIQUE constraint on assistant_id).
 *
 * Used by the "Import from Studio" mode in the launch wizard.
 */
export async function GET() {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Get all org IDs the user belongs to
  const { data: memberships, error: memErr } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)

  if (memErr) {
    return NextResponse.json({ error: 'Failed to fetch memberships' }, { status: 500 })
  }

  const orgIds = (memberships ?? []).map((m) => m.organization_id)
  if (orgIds.length === 0) {
    return NextResponse.json({ assistants: [] })
  }

  // 2. Get active assistants across those orgs
  const { data: assistants, error: aErr } = await supabase
    .from('ai_assistants')
    .select('id, name, description, avatar_url, org_id')
    .in('org_id', orgIds)
    .is('deleted_at', null)

  if (aErr) {
    return NextResponse.json({ error: 'Failed to fetch assistants' }, { status: 500 })
  }

  if (!assistants || assistants.length === 0) {
    return NextResponse.json({ assistants: [] })
  }

  // 3. Filter out assistants already in launched_agents
  const assistantIds = assistants.map((a) => a.id)
  const { data: launched, error: lErr } = await supabase
    .from('launched_agents')
    .select('assistant_id')
    .in('assistant_id', assistantIds)

  if (lErr) {
    return NextResponse.json({ error: 'Failed to check launched agents' }, { status: 500 })
  }

  const launchedIds = new Set((launched ?? []).map((l) => l.assistant_id))
  const available = assistants.filter((a) => !launchedIds.has(a.id))

  return NextResponse.json({ assistants: available })
}
