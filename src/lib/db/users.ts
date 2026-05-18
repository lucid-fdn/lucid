/**
 * User Profile operations
 */

import { cache } from 'react'
import { supabase, ErrorService, isTransientSupabaseError } from './client'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

const PROFILE_CACHE_TTL_MS = 30_000
type ProfileRecord = Record<string, any>
export type ProfileLookupResult =
  | { status: 'found'; profile: ProfileRecord }
  | { status: 'missing'; profile: null }
  | { status: 'unavailable'; profile: null; error: unknown }
const PROFILE_SELECT =
  'id, handle, email, name, first_name, last_name, avatar_url, bio, homepage, interests, github_username, twitter_username, linkedin_url, onboarding_completed, profile_public, created_at, updated_at' as const
const profileCache = new Map<string, {
  expiresAt: number
  value: ProfileRecord | null
}>()
const profileInflight = new Map<string, Promise<ProfileLookupResult>>()

/**
 * Get user profile lookup state with React cache() for request deduplication.
 *
 * Missing rows are a valid onboarding signal. Transient database/network
 * failures are not; callers that make navigation decisions must distinguish
 * them so a slow Supabase request does not force users into onboarding.
 */
export const getProfileLookup = cache(async (userId: string): Promise<ProfileLookupResult> => {
  const cached = profileCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
      ? { status: 'found', profile: cached.value }
      : { status: 'missing', profile: null }
  }

  const existing = profileInflight.get(userId)
  if (existing) return existing

  const inflight = (async () => {
    const startTime = Date.now()
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[DB-QUERY] Failed to fetch profile', {
        userId: maskIdentifier(userId),
        error: summarizeError(error),
      })
      if (isTransientSupabaseError(error)) {
        return { status: 'unavailable', profile: null, error } satisfies ProfileLookupResult
      }
      return { status: 'missing', profile: null } satisfies ProfileLookupResult
    }

    if (process.env.DEBUG_DB_QUERIES === 'true') {
      console.log('[DB-QUERY] getProfile', {
        duration_ms: Date.now() - startTime,
        cache: 'miss',
        userId: maskIdentifier(typeof data?.id === 'string' ? data.id : null),
      })
    }

    return data
      ? ({ status: 'found', profile: data } satisfies ProfileLookupResult)
      : ({ status: 'missing', profile: null } satisfies ProfileLookupResult)
  })()

  profileInflight.set(userId, inflight)
  try {
    const result = await inflight
    if (result.status !== 'unavailable') {
      profileCache.set(userId, {
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        value: result.profile,
      })
    }
    return result
  } finally {
    profileInflight.delete(userId)
  }
})

/**
 * Get user profile with React cache() for request deduplication.
 * Prevents multiple DB queries within the same request.
 */
export const getProfile = cache(async (userId: string) => {
  const result = await getProfileLookup(userId)
  return result.status === 'found' ? result.profile : null
})

export async function getProfileByHandle(handle: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('handle', handle)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        handle,
        table: 'profiles',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'profiles'
      }
    });
    return null;
  }

  return data;
}

export async function createProfile(profile: {
  id?: string;
  handle: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
}) {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile as unknown as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        handle: profile.handle,
        hasEmail: !!profile.email,
        table: 'profiles',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'profiles'
      }
    });
    throw error;
  }

  if (data?.id) profileCache.delete(data.id as string)
  return data;
}

export async function updateProfile(userId: string, updates: {
  name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  bio?: string;
  handle?: string;
  homepage?: string;
  interests?: string[];
  github_username?: string;
  twitter_username?: string;
  linkedin_url?: string;
  onboarding_completed?: boolean;
}) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates as unknown as Record<string, unknown>)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        updateFields: Object.keys(updates),
        table: 'profiles',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'profiles'
      }
    });
    throw error;
  }

  profileCache.delete(userId)
  return data;
}

export async function updateLastLogin(userId: string): Promise<void> {
  await supabase
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() } as Record<string, unknown>)
    .eq('id', userId)
  // Non-critical — don't throw
}

export async function checkHandleExists(handle: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('handle')
    .eq('handle', handle.toLowerCase())
    .single();

  return !!data && !error;
}

export async function completeOnboarding(userId: string, profile: {
  handle: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  homepage?: string;
  interests?: string[];
  github_username?: string;
  twitter_username?: string;
  linkedin_url?: string;
  onboarding_completed?: boolean;
}) {
  // Parse name into first_name and last_name
  const nameParts = profile.name.trim().split(/\s+/)
  const first_name = nameParts[0] || ''
  const last_name = nameParts.slice(1).join(' ') || ''

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...profile,
      first_name, // ✅ ADD: Save parsed first name
      last_name,  // ✅ ADD: Save parsed last name
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        handle: profile.handle,
        table: 'profiles',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'profiles'
      }
    });
    throw error;
  }

  profileCache.delete(userId)
  return data;
}
