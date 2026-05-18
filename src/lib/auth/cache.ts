/**
 * Auth Session Caching Layer
 *
 * React `cache()` for request-level deduplication.
 * Multiple components calling getCachedSession() hit DB once per request.
 */

import { cache } from 'react'
import { getServerSession, type ServerSession } from './session'
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import { getRedisRestEnv } from '@/lib/redis/env'
import { summarizeError } from '@/lib/logging/safe-log'

// ============================================================================
// Types
// ============================================================================

export type CachedUser = {
  id: string
  handle: string
  name?: string
  email?: string
  avatar_url?: string
  bio?: string
  homepage?: string
  interests?: string[]
  github_username?: string
  twitter_username?: string
  linkedin_url?: string
  profile_public?: boolean
  created_at: string
  last_login_at?: string
}

export type CachedSession = ServerSession & {
  user?: CachedUser
}

const CACHED_USER_TTL_MS = 30_000
const cachedUserProcessCache = new Map<string, {
  expiresAt: number
  value: CachedUser | null
}>()
const cachedUserInflight = new Map<string, Promise<CachedUser | null>>()

// ============================================================================
// Supabase Client (shared singleton)
// ============================================================================

let supabase: ReturnType<typeof createClient> | null = null

function getSupabaseClient() {
  if (!supabase) {
    // Use SUPABASE_URL (server-only) first; NEXT_PUBLIC_* is inlined at build time.
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error('Supabase credentials not configured')
    }

    supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) })) as typeof fetch,
      },
    })
  }

  return supabase
}

// ============================================================================
// Request-Level Cache (React cache())
// ============================================================================

/**
 * Get cached session for current request.
 * Deduplicates: multiple calls within one request = 1 DB query.
 */
export const getCachedSession = cache(async (): Promise<CachedSession> => {
  try {
    const session = await getServerSession()

    if (!session.userId) {
      return { userId: null }
    }

    const user = await getCachedUser(session.userId)

    return {
      ...session,
      user: user || undefined,
    }
  } catch (error) {
    console.error('[auth-cache] Failed to get auth context:', summarizeError(error))
    return { userId: null }
  }
})

/**
 * Get cached user profile for current request.
 */
export const getCachedUser = cache(
  async (userId: string): Promise<CachedUser | null> => {
    const cached = cachedUserProcessCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const existing = cachedUserInflight.get(userId)
    if (existing) return existing

    const inflight = (async () => {
      try {
        const supa = getSupabaseClient()

        const { data: profile, error } = await supa
          .from('profiles')
          .select(
            'id, handle, name, first_name, last_name, email, avatar_url, bio, homepage, interests, github_username, twitter_username, linkedin_url, profile_public, created_at, last_login_at',
          )
          .eq('id', userId)
          .maybeSingle()

        if (error || !profile) {
          console.error('[auth-cache] Profile fetch failed:', error ? summarizeError(error) : null)
          return null
        }

        return profile as CachedUser
      } catch (error) {
        console.error('[auth-cache] Profile fetch error:', summarizeError(error))
        return null
      }
    })()

    cachedUserInflight.set(userId, inflight)
    try {
      const value = await inflight
      cachedUserProcessCache.set(userId, {
        expiresAt: Date.now() + CACHED_USER_TTL_MS,
        value,
      })
      return value
    } finally {
      cachedUserInflight.delete(userId)
    }
  },
)

/**
 * Get cached user permissions (stub; returns empty for now).
 */
export const getCachedPermissions = cache(
  async (_userId: string): Promise<string[]> => {
    return []
  },
)

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Prefetch session data; call in layouts to warm cache before components render.
 */
export async function prefetchSession(): Promise<void> {
  try {
    await getCachedSession()
  } catch {
    // Prefetch failures are non-critical
  }
}

/**
 * Prefetch user data.
 */
export async function prefetchUser(userId: string): Promise<void> {
  try {
    await getCachedUser(userId)
  } catch {
    // Prefetch failures are non-critical
  }
}

// ============================================================================
// Cache Store Interface
// ============================================================================

export interface CacheStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown, ttl: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

export class MemoryCacheStore implements CacheStore {
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

/** Singleton cache for cross-request persistence (e.g. Privy token to session, 1h TTL). */
export class UpstashCacheStore implements CacheStore {
  private redis: Redis
  private fallback = new MemoryCacheStore()

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token })
  }

  async get(key: string): Promise<unknown> {
    try {
      const value = await this.redis.get(key)
      if (value !== null && value !== undefined) return value
      return this.fallback.get(key)
    } catch {
      return this.fallback.get(key)
    }
  }

  async set(key: string, value: unknown, ttl: number): Promise<void> {
    await this.fallback.set(key, value, ttl)
    try {
      await this.redis.set(key, value, { ex: ttl })
    } catch {
      // Memory fallback already has the value for this process.
    }
  }

  async delete(key: string): Promise<void> {
    await this.fallback.delete(key)
    try {
      await this.redis.del(key)
    } catch {
      // Best-effort distributed invalidation.
    }
  }

  async clear(): Promise<void> {
    await this.fallback.clear()
  }
}

function createAuthCacheStore(): CacheStore {
  const redisEnv = getRedisRestEnv()
  if (redisEnv) {
    return new UpstashCacheStore(redisEnv.url, redisEnv.token)
  }
  return new MemoryCacheStore()
}

const globalForAuthCache = globalThis as typeof globalThis & {
  __lucidAuthCacheStore?: CacheStore
}

export const cacheStore = globalForAuthCache.__lucidAuthCacheStore ?? createAuthCacheStore()
globalForAuthCache.__lucidAuthCacheStore = cacheStore
