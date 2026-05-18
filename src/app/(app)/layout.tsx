/**
 * Studio Layout (Server Component)
 * 
 * Industry Standard Pattern:
 * 1. Server-side: Fetch data using centralized system
 * 2. Server-side: Get user workspaces for dropdown
 * 3. Server-side: Extract current workspace from URL
 * 4. Pass data to client components
 */

import React from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserId } from "@/lib/auth/server-utils"
import { getUserWorkspacesLookup } from "@/lib/workspace"
import { getProfileLookup } from "@/lib/db"
import { AppClientLayout } from "./app-client-layout"

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 1. Get user ID (centralized auth)
  const userId = await getUserId()
  
  // 2. Check if profile is complete (onboarding requirement)
  // Skip check for onboarding routes themselves
  const headersList = await headers()
  let pathname = headersList.get('x-invoke-path') || 
                 headersList.get('x-url') || 
                 headersList.get('referer') || ''
  
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    try {
      const url = new URL(pathname)
      pathname = url.pathname
    } catch (_e) {
      pathname = ''
    }
  }
  
  // Don't redirect if already on onboarding routes
  const isOnboardingRoute = pathname.includes('/onboarding')
  
  if (userId && !isOnboardingRoute) {
    const profileLookup = await getProfileLookup(userId)
    // Redirect only when we can prove the profile is missing/incomplete.
    // A transient DB/network timeout should not rewrite navigation to onboarding.
    if (profileLookup.status === 'unavailable') {
      console.warn('[studio-layout] Profile lookup unavailable; skipping onboarding redirect')
    } else if (profileLookup.status === 'missing' || !profileLookup.profile.onboarding_completed) {
      redirect('/onboarding/profile')
    }
  }
  // 3. Extract workspace slug from pathname (e.g., /my-workspace/dashboard → my-workspace)
  const pathSegments = pathname.split('/').filter(Boolean)
  const currentWorkspaceSlug = pathSegments[0] || null
  
  // 4. Fetch user workspaces using centralized system (if authenticated)
  let userWorkspaces: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    member_count?: number
    plan_name?: string
  }> = []
  let workspaceLookupAvailable = true
  
  if (userId) {
    const workspaceLookup = await getUserWorkspacesLookup(userId)
    if (workspaceLookup.status === 'unavailable') {
      workspaceLookupAvailable = false
      console.warn('[studio-layout] Workspace lookup unavailable; skipping workspace onboarding redirect')
    } else {
      userWorkspaces = workspaceLookup.workspaces.map(ws => ({
        id: ws.id,
        slug: ws.slug,
        name: ws.name,
        type: ws.type,
        role: ws.role,
        logo_url: ws.logo_url,
        member_count: ws.member_count,
        plan_name: ws.plan_name
      }))
    }
  }

  // If the user finished profile onboarding but still has no workspace
  // membership, force them into workspace onboarding before any app route
  // assumes an org/project exists.
  if (userId && workspaceLookupAvailable && userWorkspaces.length === 0) {
    redirect('/onboarding/workspace/new')
  }

  // 5. Pass data to client layout
  return (
    <AppClientLayout
      userWorkspaces={userWorkspaces}
      currentWorkspaceSlug={currentWorkspaceSlug}
    >
      {children}
    </AppClientLayout>
  )
}
