'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react'
import { useAuth } from './auth-context'
import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log'

interface Profile {
  id: string
  name?: string
  email?: string
  avatar_url?: string
  handle?: string
  bio?: string
  // Add other profile fields as needed
}

interface ProfileContextType {
  profile: Profile | null
  loading: boolean
  refetch: () => void
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)
const DEBUG_PROFILE_PROVIDER = process.env.NEXT_PUBLIC_DEBUG_PROFILE_PROVIDER === 'true'

function debugProfile(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_PROFILE_PROVIDER) return
  console.debug(`[ProfileProvider] ${message}`, redactLogMetadata(metadata))
}

function summarizeProfile(profile: Profile | null | undefined) {
  if (!profile) return null
  return {
    id: profile.id,
    hasEmail: Boolean(profile.email),
    hasHandle: Boolean(profile.handle),
    hasName: Boolean(profile.name),
    hasAvatar: Boolean(profile.avatar_url),
  }
}

/**
 * Profile Provider - Server-side initial data + client updates
 * Like NextAuth SessionProvider pattern
 * 
 * @param initialProfile - Server-fetched profile for instant display
 */
export function ProfileProvider({ 
  children, 
  initialProfile 
}: { 
  children: ReactNode
  initialProfile?: Profile | null
}) {
  debugProfile('Initializing', {
    hasInitialProfile: !!initialProfile,
    initialProfile: summarizeProfile(initialProfile),
  })

  const { ready, user, isAuthenticated } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(initialProfile || null)
  const [loading, setLoading] = useState(false)

  debugProfile('State', {
    hasProfile: !!profile,
    profile: summarizeProfile(profile),
    loading,
    isAuthenticated,
  })

  const fetchProfile = async () => {
    // ✅ Wait for Privy to be ready
    if (!ready || !isAuthenticated || !user) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/user/profile')
      if (res.ok) {
        const data = await res.json()
        debugProfile('Fetched profile', { profile: summarizeProfile(data) })
        setProfile(data)
      }
    } catch (error) {
      console.error('[ProfileProvider] Error fetching profile:', summarizeError(error))
    } finally {
      setLoading(false)
    }
  }

  // Sync state when server re-renders with new initialProfile (e.g., after onboarding)
  // Key on primitive ID, not object reference, to avoid infinite re-render loops
  const initialProfileId = initialProfile?.id
  useEffect(() => {
    if (initialProfile && initialProfileId !== profile?.id) {
      setProfile(initialProfile)
    }
  }, [initialProfileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch profile on mount if no initial data
  useEffect(() => {
    if (!initialProfileId && ready && isAuthenticated && user) {
      debugProfile('No initial profile, fetching')
      fetchProfile()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [ready, isAuthenticated, user, initialProfileId])

  const refetch = () => {
    debugProfile('Refetching profile')
    fetchProfile()
  }

  const value = useMemo(() => ({
    profile,
    loading,
    refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable
  }), [profile, loading])

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

/**
 * Hook to access profile data anywhere in the app
 * Industry standard pattern
 * 
 * @example
 * const { profile, loading, refetch } = useProfile()
 * 
 * // Use in navbar
 * <Avatar src={profile?.avatar_url} />
 * 
 * // Use in settings
 * <Input value={profile?.name} />
 * 
 * // After upload, refetch
 * await uploadAvatar()
 * refetch()
 */
export function useProfile() {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return context
}
