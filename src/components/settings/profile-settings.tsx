"use client"

import { ProfileForm } from '@/components/settings/profile-form'
import { useProfile } from '@/contexts/profile-context'

/** Extended profile shape with all DB fields that may be returned */
interface ExtendedProfile {
  id: string
  name?: string
  email?: string
  avatar_url?: string
  handle?: string
  bio?: string
  homepage?: string
  interests?: string[]
  github_username?: string
  twitter_username?: string
  linkedin_url?: string
  profile_public?: boolean
}

export function ProfileSettings() {
  const { profile, refetch } = useProfile()

  if (!profile) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Profile Settings</h2>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    )
  }

  // Cast to extended profile to access all DB fields
  const fullProfile = profile as ExtendedProfile

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
        key={fullProfile.id} // Force re-render when profile changes
        defaultValues={{
          name: fullProfile.name || fullProfile.handle || '',
          avatar_url: fullProfile.avatar_url || '',
          bio: fullProfile.bio || '',
          homepage: fullProfile.homepage || '',
          interests: fullProfile.interests || [],
          github_username: fullProfile.github_username || '',
          twitter_username: fullProfile.twitter_username || '',
          linkedin_url: fullProfile.linkedin_url || '',
          profile_public: fullProfile.profile_public, // Pass profile_public from DB
        }}
        userName={fullProfile.name || fullProfile.handle}
        onSaveSuccess={refetch} // Refetch after save
      />
    </div>
  )
}
