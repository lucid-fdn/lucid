import 'server-only'

import { supabase } from '@/lib/db/client'

/**
 * Ensure a user has at least one organization for launchpad use.
 * If the user has no orgs, silently creates a personal one with
 * a real Launchpad project and environment.
 *
 * Returns the org_id that can be used for launching agents.
 */
export async function ensurePersonalOrg(userId: string): Promise<string> {
  // Check if user already has any org
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)

  if (memberships && memberships.length > 0) {
    return memberships[0].organization_id
  }

  // No org — create a personal one
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: 'Personal',
      slug: `personal-${userId.slice(0, 8)}`,
      type: 'personal',
    })
    .select('id')
    .single()

  if (orgErr || !org) {
    throw new Error(`Failed to create personal org: ${orgErr?.message ?? 'unknown'}`)
  }

  // Add user as owner
  await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })

  // Create a real starter project for launchpad flows
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .insert({
      org_id: org.id,
      name: 'Launchpad',
      slug: 'launchpad',
    })
    .select('id')
    .single()

  if (projErr || !project) {
    throw new Error(`Failed to create launchpad project: ${projErr?.message ?? 'unknown'}`)
  }

  // Create default environment
  await supabase
    .from('environments')
    .insert({
      project_id: project.id,
      name: 'Production',
      slug: 'production',
      is_default: true,
    })

  return org.id
}
