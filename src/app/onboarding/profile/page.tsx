import { redirect } from 'next/navigation'
import { UserOnboardingClient } from '@/components/user-onboarding/user-onboarding-client'
import { getUserId } from '@/lib/auth/server-utils'
import { getProfile, getUserOrganizations } from '@/lib/db'

export default async function ProfileOnboardingPage() {
  // Get user
  const userId = await getUserId()
  
  if (userId) {
    // Check if onboarding is already completed
    const profile = await getProfile(userId)
    
    if (profile?.onboarding_completed) {
      // Get user's organizations to redirect to their workspace
      const orgs = await getUserOrganizations(userId)
      
      if (orgs && orgs.length > 0) {
        const firstOrg = Array.isArray(orgs[0].organization) ? orgs[0].organization[0] : orgs[0].organization
        redirect(`/${firstOrg.slug}/dashboard`)
      } else {
        // Fallback to root dashboard
        redirect('/dashboard')
      }
    }
  }
  
  return <UserOnboardingClient />
}
