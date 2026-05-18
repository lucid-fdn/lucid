/**
 * Centralized Workspace Utilities
 * Single source of truth for workspace operations and routing
 */

import 'server-only'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { primeOrgRequestContextAccess, type OrgSummary } from '@/lib/request-context/org'
import { isTransientSupabaseError } from '@/lib/db/client'

let _supabase: ReturnType<typeof createClient<any>> | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
    )
  }
  return _supabase
}

const WORKSPACE_ACCESS_CACHE_TTL_MS = 5 * 60_000

type WorkspaceGlobalCache = {
  access: Map<string, {
    expiresAt: number
    value: WorkspaceWithAccess | null
  }>
  accessInflight: Map<string, Promise<WorkspaceWithAccess | null>>
  membership: Map<string, {
    expiresAt: number
    value: { hasAccess: boolean; role?: string }
  }>
  membershipInflight: Map<string, Promise<{ hasAccess: boolean; role?: string }>>
}

const workspaceGlobalCache = getWorkspaceGlobalCache()

function getWorkspaceGlobalCache(): WorkspaceGlobalCache {
  const globalForCache = globalThis as typeof globalThis & {
    __lucidWorkspaceAccessCache?: WorkspaceGlobalCache
  }
  if (!globalForCache.__lucidWorkspaceAccessCache) {
    globalForCache.__lucidWorkspaceAccessCache = {
      access: new Map(),
      accessInflight: new Map(),
      membership: new Map(),
      membershipInflight: new Map(),
    }
  }
  return globalForCache.__lucidWorkspaceAccessCache
}

// ============================================================================
// TYPES
// ============================================================================

export interface Workspace {
  id: string
  slug: string
  name: string
  type: string
  logo_url?: string
  bio?: string
  created_at: string
}

export interface WorkspaceWithAccess extends Workspace {
  role: 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer' | 'billing'
  hasAccess: boolean
  member_count?: number
  plan_name?: string
}

export type UserWorkspacesLookupResult =
  | { status: 'ok'; workspaces: WorkspaceWithAccess[] }
  | { status: 'unavailable'; workspaces: []; error: unknown }

// ============================================================================
// SLUG GENERATION & VALIDATION
// ============================================================================

/**
 * Generate a clean, URL-safe slug from a name
 * Uses underscores instead of hyphens for consistency with handle generation
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '') // Trim underscores from ends
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single underscore
    .slice(0, 63) // Max length (database constraint)
}

/**
 * Validate slug format
 * Allows lowercase letters, numbers, hyphens, and underscores
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?$/.test(slug)
}

/**
 * Check if slug exists
 */
export async function slugExists(slug: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('organizations')
    .select('slug')
    .eq('slug', slug.toLowerCase())
    .single()
  
  return !!data
}

/**
 * Ensure slug is unique by adding suffix if needed
 */
export async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug
  let counter = 1
  
  while (await slugExists(slug)) {
    slug = `${baseSlug}-${counter}`
    counter++
    
    // Safety: prevent infinite loop
    if (counter > 1000) {
      throw new Error('Unable to generate unique slug')
    }
  }
  
  return slug
}

// ============================================================================
// WORKSPACE FETCHING (with React cache for request deduplication)
// ============================================================================

/**
 * Get workspace by slug
 * Cached per request to prevent duplicate queries
 */
export const getWorkspaceBySlug = cache(async (slug: string): Promise<Workspace | null> => {
  if (!isValidSlug(slug)) {
    return null
  }

  const { data, error } = await getSupabase()
    .from('organizations')
    .select('id, slug, name, type, logo_url, bio, created_at')
    .eq('slug', slug.toLowerCase())
    .single()

  if (error || !data) {
    return null
  }

  return data
})

/**
 * Get workspace by ID
 * Cached per request
 */
export const getWorkspaceById = cache(async (id: string): Promise<Workspace | null> => {
  const { data, error } = await getSupabase()
    .from('organizations')
    .select('id, slug, name, type, logo_url, bio, created_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data
})

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Check if user has access to workspace
 * Returns role if has access, null otherwise
 */
export const checkWorkspaceAccess = cache(async (
  userId: string,
  workspaceId: string
): Promise<{ hasAccess: boolean; role?: string }> => {
  const cacheKey = `${userId}:${workspaceId}`
  const cached = workspaceGlobalCache.membership.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value.hasAccess && cached.value.role) {
      await primeOrgRequestContextAccess({ userId, orgId: workspaceId, role: cached.value.role })
    }
    return cached.value
  }

  const existing = workspaceGlobalCache.membershipInflight.get(cacheKey)
  if (existing) return existing

  let shouldCacheResult = true
  const inflight = (async () => {
    const { data, error } = await getSupabase()
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', workspaceId)
      .single()

    if (error) {
      shouldCacheResult = error.code === 'PGRST116'
      return { hasAccess: false }
    }

    if (!data) {
      return { hasAccess: false }
    }

    return { hasAccess: true, role: data.role }
  })()

  workspaceGlobalCache.membershipInflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    if (shouldCacheResult) {
      workspaceGlobalCache.membership.set(cacheKey, {
        expiresAt: Date.now() + WORKSPACE_ACCESS_CACHE_TTL_MS,
        value,
      })
    }
    if (value.hasAccess && value.role) {
      await primeOrgRequestContextAccess({ userId, orgId: workspaceId, role: value.role })
    }
    return value
  } finally {
    workspaceGlobalCache.membershipInflight.delete(cacheKey)
  }
})

/**
 * Get workspace with access check — single query (inner join: org + membership)
 * Returns workspace with user's role, or null if no access
 */
export const getWorkspaceWithAccess = cache(async (
  slug: string,
  userId: string
): Promise<WorkspaceWithAccess | null> => {
  if (!isValidSlug(slug)) return null
  const normalizedSlug = slug.toLowerCase()
  const cacheKey = `${userId}:${normalizedSlug}`
  const cached = workspaceGlobalCache.access.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value) {
      await primeOrgRequestContextAccess({
        userId,
        orgId: cached.value.id,
        role: cached.value.role,
        org: workspaceToOrgSummary(cached.value),
      })
    }
    return cached.value
  }

  const existing = workspaceGlobalCache.accessInflight.get(cacheKey)
  if (existing) return existing

  let shouldCacheResult = true
  const inflight = (async () => {
    // Single query: fetch org only if user is a member (!inner join)
    const { data, error } = await getSupabase()
      .from('organizations')
      .select(`
        id, slug, name, type, logo_url, bio, created_at,
        organization_members!organization_members_organization_id_fkey!inner(role)
      `)
      .eq('slug', normalizedSlug)
      .eq('organization_members.user_id', userId)
      .single()

    if (error) {
      shouldCacheResult = error.code === 'PGRST116'
      return null
    }

    if (!data) return null

    const members = data.organization_members as any[]
    const role = members?.[0]?.role
    if (!role) return null

    const workspace = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      type: data.type,
      logo_url: data.logo_url,
      bio: data.bio,
      created_at: data.created_at,
      role: role as WorkspaceWithAccess['role'],
      hasAccess: true,
    }
    await primeOrgRequestContextAccess({
      userId,
      orgId: workspace.id,
      role,
      org: workspaceToOrgSummary(workspace),
    })
    return workspace
  })()

  workspaceGlobalCache.accessInflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    if (shouldCacheResult) {
      workspaceGlobalCache.access.set(cacheKey, {
        expiresAt: Date.now() + WORKSPACE_ACCESS_CACHE_TTL_MS,
        value,
      })
    }
    return value
  } finally {
    workspaceGlobalCache.accessInflight.delete(cacheKey)
  }
})

function workspaceToOrgSummary(workspace: Workspace): OrgSummary {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    logo_url: workspace.logo_url ?? null,
  }
}

// ============================================================================
// USER WORKSPACES
// ============================================================================

async function queryUserWorkspaces(userId: string): Promise<UserWorkspacesLookupResult> {
  const { data, error } = await getSupabase()
    .from('organization_members')
    .select(`
      role,
      organization:organizations!organization_members_organization_id_fkey(
        id,
        slug,
        name,
        type,
        logo_url,
        bio,
        created_at,
        organization_members!organization_members_organization_id_fkey(count),
        subscriptions(
          plan:plans(name),
          status
        )
      )
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  if (error || !data) {
    if (error && isTransientSupabaseError(error)) {
      return { status: 'unavailable', workspaces: [], error }
    }
    return { status: 'ok', workspaces: [] }
  }

  const workspaces = data
    .filter((item: any) => item.organization)
    .map((item: any) => {
      const org = item.organization as Record<string, any>

      // Extract member count from nested aggregate
      const memberCount = org.organization_members?.[0]?.count ?? 1

      // Extract plan name from active subscription
      const activeSub = (org.subscriptions as any[] | null)?.find(
        (s: any) => s.status === 'active',
      )
      const planName = activeSub?.plan?.name || 'Free'

      return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        type: org.type,
        logo_url: org.logo_url,
        bio: org.bio,
        created_at: org.created_at,
        role: item.role,
        hasAccess: true,
        member_count: memberCount,
        plan_name: planName,
      } as WorkspaceWithAccess
    })
  return { status: 'ok', workspaces }
}

/**
 * Get all workspaces for a user with enriched data (member count, plan)
 * Single query with joins — no N+1.
 */
export const getUserWorkspaces = cache(async (userId: string): Promise<WorkspaceWithAccess[]> => {
  const result = await queryUserWorkspaces(userId)
  return result.workspaces
})

/**
 * Workspace lookup for navigation guards.
 *
 * Empty membership is an onboarding signal; transient DB/network failures are
 * not. Layouts use this to avoid redirecting users into onboarding when the
 * control plane cannot prove membership state yet.
 */
export const getUserWorkspacesLookup = cache(async (userId: string): Promise<UserWorkspacesLookupResult> => {
  return queryUserWorkspaces(userId)
})

/**
 * Get workspace members with profile data
 * Cached per request for performance
 */
export const getWorkspaceMembers = cache(async (workspaceId: string) => {
  // Fetch all members
  const { data: membersList, error: membersError } = await getSupabase()
    .from('organization_members')
    .select('id, role, created_at, user_id')
    .eq('organization_id', workspaceId)
    .order('created_at', { ascending: true })
  
  if (membersError || !membersList) {
    return []
  }
  
  // Fetch profiles for these members
  const userIds = membersList.map(m => m.user_id)
  const { data: profiles, error: profilesError } = await getSupabase()
    .from('profiles')
    .select('id, handle, name, first_name, last_name, avatar_url, email, wallet_address')
    .in('id', userIds)
  
  if (profilesError) {
    return []
  }
  
  // Combine members with profiles
  const members = membersList.map(member => ({
    ...member,
    profiles: profiles?.find(p => p.id === member.user_id)
  }))
  
  return members
})

// ============================================================================
// URL HELPERS
// ============================================================================

/**
 * Get workspace URL
 */
export function getWorkspaceUrl(slug: string, path: string = ''): string {
  const basePath = `/${slug}`
  if (!path) return basePath
  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Get workspace dashboard URL
 */
export function getWorkspaceDashboardUrl(slug: string): string {
  return getWorkspaceUrl(slug, '/dashboard')
}

/**
 * Get workspace settings URL
 */
export function getWorkspaceSettingsUrl(slug: string, section?: string): string {
  const base = getWorkspaceUrl(slug, '/settings')
  return section ? `${base}/${section}` : base
}

// ============================================================================
// MIGRATION HELPERS (Backward Compatibility)
// ============================================================================

/**
 * Get workspace from slug OR id (for backward compatibility)
 */
export async function getWorkspaceFromUrl(
  slug?: string,
  orgId?: string
): Promise<Workspace | null> {
  if (slug) {
    return await getWorkspaceBySlug(slug)
  }
  
  if (orgId) {
    return await getWorkspaceById(orgId)
  }
  
  return null
}

/**
 * Redirect old URL format to new slug-based format
 */
export async function redirectToSlugUrl(orgId: string, path: string = '/dashboard') {
  const workspace = await getWorkspaceById(orgId)
  
  if (!workspace) {
    notFound()
  }
  
  redirect(getWorkspaceUrl(workspace.slug, path))
}

// ============================================================================
// WORKSPACE OPERATIONS
// ============================================================================

/**
 * Update workspace slug
 * Creates redirect mapping for old slug
 */
export async function updateWorkspaceSlug(
  workspaceId: string,
  newSlug: string
): Promise<{ success: boolean; oldSlug: string }> {
  // Validate new slug
  if (!isValidSlug(newSlug)) {
    throw new Error('Invalid slug format')
  }
  
  // Check if new slug is available
  const exists = await slugExists(newSlug)
  if (exists) {
    throw new Error('Slug already taken')
  }
  
  // Get current workspace
  const workspace = await getWorkspaceById(workspaceId)
  if (!workspace) {
    throw new Error('Workspace not found')
  }
  
  const oldSlug = workspace.slug
  
  // Update slug
  const { error } = await getSupabase()
    .from('organizations')
    .update({ slug: newSlug })
    .eq('id', workspaceId)
  
  if (error) {
    throw error
  }
  
  return { success: true, oldSlug }
}
