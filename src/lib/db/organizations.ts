/**
 * Organization operations
 */

import { supabase, ErrorService, isTransientSupabaseError } from './client'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

const ORG_ACCESS_CACHE_TTL_MS = 30_000
type UserOrganizationRow = Record<string, unknown>

const ORGANIZATION_PUBLIC_SELECT =
  'id, name, display_name, slug, description, logo_url, bio, website_url, homepage, github_username, twitter_username, linkedin_url, socials, verified, is_public, workspace_public, created_at, updated_at' as const

const userOrganizationsCache = new Map<string, {
  expiresAt: number
  value: UserOrganizationRow[]
}>()
const userOrganizationsInflight = new Map<string, Promise<UserOrganizationRow[]>>()

const orgMembershipCache = new Map<string, {
  expiresAt: number
  value: boolean
}>()
const orgMembershipInflight = new Map<string, Promise<boolean>>()

const orgRoleCache = new Map<string, {
  expiresAt: number
  value: string | null
}>()
const orgRoleInflight = new Map<string, Promise<string | null>>()

function membershipCacheKey(userId: string, orgId: string): string {
  return `${userId}:${orgId}`
}

function clearUserOrganizationCaches(userId: string, orgId?: string) {
  userOrganizationsCache.delete(userId)
  if (!orgId) return
  const key = membershipCacheKey(userId, orgId)
  orgMembershipCache.delete(key)
  orgRoleCache.delete(key)
}

export async function companyBySlug(slug: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_PUBLIC_SELECT)
    .eq('slug', slug)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        slug,
        table: 'organizations',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'organizations'
      }
    });
    return null;
  }

  return data;
}

export async function companyStats(orgId: string) {
  const { data, error } = await supabase
    .from('organization_stats')
    .select('assets_count, followers_count')
    .eq('org_id', orgId)
    .single();

  if (error) {
    // Stats might not exist yet, that's ok
    return { assets_count: 0, followers_count: 0 };
  }

  return data || { assets_count: 0, followers_count: 0 };
}

export async function followOrg(userId: string, orgId: string) {
  const { error } = await supabase
    .from('follows_orgs')
    .insert({ user_id: userId, org_id: orgId })
    .select()
    .single();

  if (error && error.code !== '23505') { // Ignore duplicate
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        orgId,
        table: 'follows_orgs',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'follows_orgs'
      }
    });
    throw error;
  }
}

export async function unfollowOrg(userId: string, orgId: string) {
  const { error } = await supabase
    .from('follows_orgs')
    .delete()
    .eq('user_id', userId)
    .eq('org_id', orgId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        orgId,
        table: 'follows_orgs',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'follows_orgs'
      }
    });
    throw error;
  }
}

export async function isFollowingOrg(userId: string, orgId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows_orgs')
    .select('user_id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .single();

  return !!data && !error;
}

export async function rateOrg(orgId: string, userId: string, score: 1 | 2 | 3 | 4 | 5) {
  const { error } = await supabase
    .from('ratings')
    .upsert({
      org_id: orgId,
      user_id: userId,
      rating: score,
    }, {
      onConflict: 'user_id,org_id',
    });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        userId,
        score,
        table: 'ratings',
        operation: 'UPSERT'
      },
      tags: {
        layer: 'database',
        table: 'ratings'
      }
    });
    throw error;
  }
}

export async function createOrganization(org: {
  slug: string;
  name: string;
  type?: string;
  logo_url?: string;
  bio?: string;
  homepage?: string;
  interests?: string[];
  github_username?: string;
  twitter_username?: string;
  linkedin_url?: string;
  metadata?: Record<string, unknown>;
}, creatorId: string) {
  // Create organization
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .insert({
      slug: org.slug.toLowerCase(),
      name: org.name,
      type: org.type,
      logo_url: org.logo_url,
      bio: org.bio,
      homepage: org.homepage,
      interests: org.interests,
      github_username: org.github_username,
      twitter_username: org.twitter_username,
      linkedin_url: org.linkedin_url,
      metadata: org.metadata,
      created_by: creatorId,
    } as Record<string, unknown>)
    .select()
    .single();

  if (orgError) {
    ErrorService.captureException(orgError, {
      severity: 'error',
      context: {
        slug: org.slug,
        name: org.name,
        creatorId,
        table: 'organizations',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'organizations'
      }
    });
    throw orgError;
  }

  // Add creator as owner
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: orgData.id,
      user_id: creatorId,
      role: 'owner',
    } as Record<string, unknown>);

  if (memberError) {
    ErrorService.captureException(memberError, {
      severity: 'error',
      context: {
        organizationId: orgData.id,
        creatorId,
        table: 'organization_members',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'organization_members'
      }
    });

    // Compensating delete: the org row is already committed, but without a
    // matching membership row it's an orphan — invisible to every
    // membership-joined query (including `findUserOrgByMetadataFlag`) while
    // still holding its unique slug, which would cause the next
    // `ensureRetailOrg` attempt by the same user to 23505 forever. Roll it
    // back so the caller can safely retry. If the compensating delete
    // itself fails we log loudly (rare edge case squared) but still throw
    // the original memberError so the caller sees the root cause.
    const { error: rollbackError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgData.id);
    if (rollbackError) {
      ErrorService.captureException(rollbackError, {
        severity: 'error',
        context: {
          organizationId: orgData.id,
          creatorId,
          operation: 'createOrganization rollback (orphaned org row)',
        },
        tags: { layer: 'database', table: 'organizations' },
      });
    }

    throw memberError;
  }

  // Auto-assign starter (free) plan — every org gets a subscription on creation
  try {
    const { data: starterPlan } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'starter')
      .eq('is_active', true)
      .single()

    if (starterPlan) {
      const now = new Date()
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1) // 1st of next month
      await supabase
        .from('subscriptions')
        .insert({
          org_id: orgData.id,
          plan_id: starterPlan.id,
          status: 'active',
          billing_period: 'monthly',
          payment_method: 'stripe_card',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        } as Record<string, unknown>)
    }
  } catch (subError) {
    // Non-fatal: org was created, subscription assignment failed
    ErrorService.captureException(subError instanceof Error ? subError : new Error(String(subError)), {
      severity: 'warning',
      context: {
        organizationId: orgData.id,
        operation: 'auto-assign starter plan',
      },
      tags: { layer: 'database', table: 'subscriptions' },
    })
  }

  clearUserOrganizationCaches(creatorId, orgData.id)
  return orgData.id;
}

export async function updateOrganization(orgId: string, updates: {
  name?: string;
  type?: string;
  logo_url?: string;
  bio?: string;
  homepage?: string;
  interests?: string[];
  github_username?: string;
  twitter_username?: string;
  linkedin_url?: string;
}) {
  const { data, error } = await supabase
    .from('organizations')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', orgId)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        updateFields: Object.keys(updates),
        table: 'organizations',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'organizations'
      }
    });
    throw error;
  }

  return data;
}

// ─── Canvas Config (stored in organizations.metadata.canvas_config) ───

export interface CanvasConfig {
  positions: Record<string, { x: number; y: number }>
  groups: Array<{
    id: string
    name: string
    color: string
    icon?: string
    memberIds: string[]
  }>
}

const EMPTY_CANVAS_CONFIG: CanvasConfig = { positions: {}, groups: [] }

export async function getCanvasConfig(orgId: string): Promise<CanvasConfig> {
  const { data, error } = await supabase
    .from('organizations')
    .select('metadata')
    .eq('id', orgId)
    .single()

  if (error || !data?.metadata) return EMPTY_CANVAS_CONFIG
  const cfg = (data.metadata as Record<string, unknown>)?.canvas_config
  if (!cfg || typeof cfg !== 'object') return EMPTY_CANVAS_CONFIG
  return cfg as CanvasConfig
}

export async function updateCanvasConfig(orgId: string, config: CanvasConfig): Promise<void> {
  // Read current metadata, merge canvas_config, write back
  const { data: current } = await supabase
    .from('organizations')
    .select('metadata')
    .eq('id', orgId)
    .single()

  const metadata = (current?.metadata as Record<string, unknown>) ?? {}
  metadata.canvas_config = config

  const { error } = await supabase
    .from('organizations')
    .update({ metadata })
    .eq('id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'updateCanvasConfig' },
      tags: { layer: 'database', table: 'organizations' },
    })
    throw error
  }
}

export async function checkOrgSlugExists(slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .eq('slug', slug.toLowerCase())
    .single();

  return !!data && !error;
}

/**
 * Get full organization details by ID
 * Used for account settings to show org info
 */
export async function getOrganizationById(orgId: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, slug, name, display_name, legal_name, type, logo_url, bio, website_url, homepage, location, interests, github_username, twitter_username, linkedin_url, workspace_public')
    .eq('id', orgId)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        table: 'organizations',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'organizations'
      }
    });
    return null;
  }

  return data;
}

export async function getUserOrganizations(userId: string) {
  const cached = userOrganizationsCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const existing = userOrganizationsInflight.get(userId)
  if (existing) return existing

  const inflight = (async () => {
    const startTime = Date.now()
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        role,
        joined_at,
        organization:organizations!organization_members_organization_id_fkey(id, slug, name, type, logo_url, bio, homepage, interests, github_username, twitter_username, linkedin_url, workspace_public)
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: {
          userId,
          table: 'organization_members',
          operation: 'SELECT'
        },
        tags: {
          layer: 'database',
          table: 'organization_members'
        }
      })
      return []
    }

    if (process.env.DEBUG_DB_QUERIES === 'true') {
      console.log('[DB-QUERY] getUserOrganizations', {
        duration_ms: Date.now() - startTime,
        cache: 'miss',
        orgCount: data?.length || 0,
      })
    }

    return (data || []) as UserOrganizationRow[]
  })()

  userOrganizationsInflight.set(userId, inflight)
  try {
    const value = await inflight
    userOrganizationsCache.set(userId, {
      expiresAt: Date.now() + ORG_ACCESS_CACHE_TTL_MS,
      value,
    })
    return value
  } finally {
    userOrganizationsInflight.delete(userId)
  }
}

/**
 * Find a user's organization tagged with a specific boolean metadata flag.
 *
 * Returns the first matching org id, or `null` if none exists. Used by the
 * retail funnel to locate the auto-provisioned personal org without widening
 * the shape of `getUserOrganizations` (which is called from many places).
 *
 * Server-side JSONB filter (`metadata->>flag = 'true'`) so we don't
 * over-fetch the member's entire org list.
 */
export async function findUserOrgByMetadataFlag(
  userId: string,
  flag: string,
): Promise<string | null> {
  // Defensive: only allow simple identifier keys in the JSONB path. Retail only
  // ever passes literal constants, so this just guards against accidental
  // injection via the `flag` argument.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(flag)) {
    throw new Error(`Invalid metadata flag key: ${flag}`)
  }

  // Primary is `organizations` so the metadata filter is applied to real rows,
  // not an embedded left-join. Use the explicit FK because this schema has
  // multiple relationships between organizations and organization_members.
  const { data, error } = await supabase
    .from('organizations')
    .select('id, member:organization_members!organization_members_organization_id_fkey!inner(user_id)')
    .eq('member.user_id', userId)
    .eq(`metadata->>${flag}`, 'true')
    .limit(1)
    .maybeSingle()

  if (error) {
    // Fail loud, not soft. Swallowing this would make `ensureRetailOrg` treat
    // a broken read as "no org exists" and race into createOrganization, which
    // turns a routable DB error into a confusing duplicate/500 downstream.
    ErrorService.captureException(error, {
      severity: 'error',
      context: { userId, flag, operation: 'findUserOrgByMetadataFlag' },
      tags: { layer: 'database', table: 'organizations' },
    })
    throw new Error(`findUserOrgByMetadataFlag failed: ${error.message}`)
  }

  return (data?.id as string | undefined) ?? null
}

/**
 * Check if a user is a member of an organization
 */
export async function isUserOrgMember(userId: string, orgId: string): Promise<boolean> {
  const cacheKey = membershipCacheKey(userId, orgId)
  const cached = orgMembershipCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const existing = orgMembershipInflight.get(cacheKey)
  if (existing) return existing

  const inflight = (async () => {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single()

    if (error && error.code !== 'PGRST116' && isTransientSupabaseError(error)) {
      throw new Error(error.message)
    }

    // PGRST116 = "no rows" - valid "not a member".
    // Any other error (network timeout, etc.) must not silently return false.
    if (error && error.code !== 'PGRST116') {
      console.error('[DB] isUserOrgMember query failed', {
        userId: maskIdentifier(userId),
        orgId: maskIdentifier(orgId),
        error: summarizeError(error),
      })
      throw new Error(`isUserOrgMember query failed: ${error.message}`)
    }

    return !!data && !error
  })()

  orgMembershipInflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    orgMembershipCache.set(cacheKey, {
      expiresAt: Date.now() + ORG_ACCESS_CACHE_TTL_MS,
      value,
    })
    return value
  } finally {
    orgMembershipInflight.delete(cacheKey)
  }
}

/**
 * Get a user's role in an organization. Returns null if not a member.
 */
export async function getOrgMemberRole(userId: string, orgId: string): Promise<string | null> {
  const cacheKey = membershipCacheKey(userId, orgId)
  const cached = orgRoleCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const existing = orgRoleInflight.get(cacheKey)
  if (existing) return existing

  const inflight = (async () => {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single()

    if (error || !data) return null
    return data.role as string
  })()

  orgRoleInflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    orgRoleCache.set(cacheKey, {
      expiresAt: Date.now() + ORG_ACCESS_CACHE_TTL_MS,
      value,
    })
    return value
  } finally {
    orgRoleInflight.delete(cacheKey)
  }
}
