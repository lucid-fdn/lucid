import { ProfileForm } from '@/components/settings/profile-form'
import { getProfile } from '@/lib/db'
import { getUserId } from '@/lib/auth/server-utils'

export const metadata = {
  title: 'Profile Settings',
  description: 'Manage your public profile information',
}

export default async function ProfileSettingsPage() {
  // Get user ID (middleware already ensures auth)
  const userId = await getUserId()
  
  if (!userId) {
    // Should never happen due to middleware, but handle gracefully
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unable to load profile. Please try refreshing the page.</p>
        </div>
      </div>
    )
  }
  
  // Fetch user profile
  const profile = await getProfile(userId)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your public profile and how others see you
        </p>
      </div>

      {/* Profile Form */}
      <ProfileForm
        defaultValues={{
          name: profile?.name || '',
          avatar_url: profile?.avatar_url || '',
          bio: profile?.bio || '',
          homepage: profile?.homepage || '',
          interests: profile?.interests || [],
          github_username: profile?.github_username || '',
          twitter_username: profile?.twitter_username || '',
          linkedin_url: profile?.linkedin_url || '',
        }}
        userName={profile?.name}
      />
    </div>
  )
}
