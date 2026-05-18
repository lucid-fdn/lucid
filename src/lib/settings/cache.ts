/**
 * Settings Data Caching Layer
 * 
 * Industry-standard pattern: Prefetch all settings data when modal opens
 * Benefits:
 * - Instant tab switching (no loading states)
 * - Single fetch per modal session
 * - Consistent with Notion/Linear/Slack patterns
 * 
 * CLIENT-SAFE: Uses browser-only caching (no server-only imports)
 */

import { cache } from 'react'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

// ============================================================================
// Types
// ============================================================================

export interface CachedMember {
  id: string
  user_id: string
  organization_id: string
  role: string
  joined_at: string
  profiles?: {
    id: string
    name?: string
    first_name?: string
    handle?: string
    email?: string
    wallet_address?: string
    avatar_url?: string
  }
}

export interface CachedInviteToken {
  id: string
  organization_id: string
  token: string
  enabled: boolean
  role?: string
  expires_at?: string | null
  used_count: number
  max_uses?: number | null
  created_at: string
}

export interface CachedSettingsData {
  members: CachedMember[]
  inviteToken: CachedInviteToken | null
  membersFetchedAt: number
  inviteFetchedAt: number
}

// ============================================================================
// Request-Level Cache (React cache())
// ============================================================================

/**
 * Get cached organization members
 * Uses React cache() for server-side request deduplication
 */
export const getCachedOrgMembers = cache(async (orgId: string): Promise<CachedMember[]> => {
  const startTime = Date.now()
  
  try {
    console.log('[SETTINGS-CACHE] getCachedOrgMembers start', { orgId: maskIdentifier(orgId) })
    
    const res = await fetch(`/api/organizations/${orgId}/members`, {
      cache: 'no-store' // Let React cache() handle caching
    })
    
    if (!res.ok) {
      console.error('[SETTINGS-CACHE] Failed to fetch members:', res.status)
      return []
    }
    
    const data = await res.json()
    const duration = Date.now() - startTime
    
    console.log('[SETTINGS-CACHE] getCachedOrgMembers complete', {
      duration_ms: duration,
      memberCount: data.members?.length || 0
    })
    
    return data.members || []
  } catch (error) {
    console.error('[SETTINGS-CACHE] Error fetching members:', summarizeError(error))
    return []
  }
})

/**
 * Get cached invite token
 * Uses React cache() for server-side request deduplication
 */
export const getCachedInviteToken = cache(async (orgId: string): Promise<CachedInviteToken | null> => {
  const startTime = Date.now()
  
  try {
    console.log('[SETTINGS-CACHE] getCachedInviteToken start', { orgId: maskIdentifier(orgId) })
    
    const res = await fetch(`/api/organizations/${orgId}/invites`, {
      cache: 'no-store'
    })
    
    if (!res.ok) {
      // 404 is normal - org might not have created an invite token yet
      if (res.status === 404) {
        console.log('[SETTINGS-CACHE] No invite record found (404) - this is normal')
        return null
      }
      // Other errors are actual problems
      console.error('[SETTINGS-CACHE] Failed to fetch invite record:', res.status)
      return null
    }
    
    const data = await res.json()
    const duration = Date.now() - startTime
    
    console.log('[SETTINGS-CACHE] getCachedInviteToken complete', {
      duration_ms: duration,
      hasToken: Boolean(data.token),
      role: data.role
    })
    
    return data
  } catch (error) {
    console.error('[SETTINGS-CACHE] Error fetching invite record:', summarizeError(error))
    return null
  }
})

// ============================================================================
// Client-Side Cache (Browser-Only Memory Store)
// ============================================================================

const CACHE_TTL = 300 // 5 minutes (in seconds)
const CACHE_KEY_PREFIX = 'settings:'

/**
 * Simple in-memory cache for client-side only
 * Follows same pattern as auth cache but browser-safe
 */
class ClientCacheStore {
  private cache = new Map<string, { value: unknown; expires: number }>()

  async get(key: string): Promise<unknown> {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }
    
    return item.value
  }
  
  async set(key: string, value: unknown, ttl: number): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl * 1000,
    })
  }
  
  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }
  
  async clear(): Promise<void> {
    this.cache.clear()
  }
}

// Client-safe cache instance (no server-only imports)
const clientCache = new ClientCacheStore()

/**
 * Get settings data from client-side cache
 */
export async function getClientCachedSettings(orgId: string): Promise<CachedSettingsData | null> {
  const cacheKey = `${CACHE_KEY_PREFIX}${orgId}`
  return await clientCache.get(cacheKey) as CachedSettingsData | null
}

/**
 * Set settings data in client-side cache
 */
export async function setClientCachedSettings(orgId: string, data: CachedSettingsData): Promise<void> {
  const cacheKey = `${CACHE_KEY_PREFIX}${orgId}`
  await clientCache.set(cacheKey, data, CACHE_TTL)
}

/**
 * Invalidate settings cache for organization
 */
export async function invalidateSettingsCache(orgId: string): Promise<void> {
  const cacheKey = `${CACHE_KEY_PREFIX}${orgId}`
  await clientCache.delete(cacheKey)
  console.log('[SETTINGS-CACHE] 🗑️ Invalidated cache for org:', orgId)
}

// ============================================================================
// Prefetch Utilities
// ============================================================================

/**
 * Prefetch all settings data when modal opens
 * Industry standard: Load everything once, cache for instant tab switching
 * 
 * @example
 * ```tsx
 * // In settings modal/context
 * useEffect(() => {
 *   if (open && orgId) {
 *     prefetchAllSettings(orgId)
 *   }
 * }, [open, orgId])
 * ```
 */
export async function prefetchAllSettings(orgId: string): Promise<CachedSettingsData> {
  const startTime = Date.now()
  console.log('[SETTINGS-CACHE] 🚀 Prefetching all settings for org:', orgId)
  
  // Check client cache first
  const cached = await getClientCachedSettings(orgId)
  if (cached) {
    const age = Date.now() - cached.membersFetchedAt
    if (age < CACHE_TTL * 1000) {
      console.log('[SETTINGS-CACHE] ⚡ Using cached data (age:', age, 'ms)')
      return cached
    }
  }
  
  // Fetch all data in parallel
  const [members, inviteToken] = await Promise.all([
    getCachedOrgMembers(orgId),
    getCachedInviteToken(orgId)
  ])
  
  const now = Date.now()
  const settingsData: CachedSettingsData = {
    members,
    inviteToken,
    membersFetchedAt: now,
    inviteFetchedAt: now
  }
  
  // Store in client cache
  await setClientCachedSettings(orgId, settingsData)
  
  const duration = Date.now() - startTime
  console.log('[SETTINGS-CACHE] ✅ Prefetch complete', {
    duration_ms: duration,
    memberCount: members.length,
    hasInviteToken: !!inviteToken
  })
  
  return settingsData
}

/**
 * Refresh specific settings section
 */
export async function refreshMembersCache(orgId: string): Promise<void> {
  console.log('[SETTINGS-CACHE] 🔄 Refreshing members cache')
  
  const cached = await getClientCachedSettings(orgId)
  const members = await getCachedOrgMembers(orgId)
  
  if (cached) {
    cached.members = members
    cached.membersFetchedAt = Date.now()
    await setClientCachedSettings(orgId, cached)
  }
}

export async function refreshInviteTokenCache(orgId: string): Promise<void> {
  console.log('[SETTINGS-CACHE] Refreshing invite cache', { orgId: maskIdentifier(orgId) })
  
  const cached = await getClientCachedSettings(orgId)
  const inviteToken = await getCachedInviteToken(orgId)
  
  if (cached) {
    cached.inviteToken = inviteToken
    cached.inviteFetchedAt = Date.now()
    await setClientCachedSettings(orgId, cached)
  }
}
