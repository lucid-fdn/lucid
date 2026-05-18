/**
 * Dashboard Redirect
 * Redirects to first workspace dashboard using slug-based URL
 * Pattern: /dashboard → /{first-workspace-slug}/dashboard
 * 
 * Codebase Pattern:
 * - Middleware: Auth token checks only (lightweight)
 * - Layout: Profile completion check (onboarding enforcement)
 * - Pages: Business logic (redirect rules)
 */

import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getUserWorkspaces } from '@/lib/workspace'
import { getUserOrganizations } from '@/lib/db'

export default async function DashboardRedirect() {
  const userId = await getUserId()
  
  // Middleware ensures auth, layout ensures profile complete
  if (!userId) {
    redirect('/login')
  }
  
  const workspaces = await getUserWorkspaces(userId)
  
  if (workspaces.length === 0) {
    // Fallback to the simpler membership query before sending an onboarded user
    // back into workspace creation. This protects first-load auth/session churn
    // when the richer workspace join returns an empty result transiently.
    const memberships = await getUserOrganizations(userId)
    const firstOrg = memberships
      .map((membership) =>
        Array.isArray(membership.organization)
          ? membership.organization[0]
          : membership.organization,
      )
      .find((organization) => typeof organization?.slug === 'string' && organization.slug.length > 0)

    if (firstOrg?.slug) {
      redirect(`/${firstOrg.slug}/dashboard`)
    }

    redirect('/onboarding/workspace/new')
  }
  
  // Redirect to first workspace using slug
  const firstWorkspace = workspaces[0]
  redirect(`/${firstWorkspace.slug}/dashboard`)
}
