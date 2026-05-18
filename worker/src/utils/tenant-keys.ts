/**
 * Canonical Multi-Tenant Key Model
 *
 * Defines the composite key structure for tenant isolation.
 * These keys MUST be computed BEFORE any lock, dedup, rate-limit, or memory operation.
 *
 * Key hierarchy:
 *   tenantKey  = orgId:projectId:envId
 *   sessionKey = tenantKey:channelType:externalChatId
 *   userKey    = tenantKey:externalUserId | '__anon__'
 *
 * See dev review: "Re-add the canonical key model (non-negotiable)"
 */

export const ANON_USER_SUFFIX = '__anon__'

export interface TenantKeys {
  tenantKey: string
  sessionKey: string
  userKey: string
}

/**
 * Build the canonical tenant key.
 * Format: `orgId:projectId:envId`
 *
 * When projectId or envId are not available (Phase 1), uses 'default'.
 */
export function buildTenantKey(
  orgId: string | null,
  projectId?: string | null,
  envId?: string | null
): string {
  const org = orgId || '__global__'
  const proj = projectId || 'default'
  const env = envId || 'default'
  return `${org}:${proj}:${env}`
}

/**
 * Build the canonical session key.
 * Format: `tenantKey:channelType:externalChatId`
 *
 * Used for conversation locking and scoping.
 */
export function buildSessionKey(
  tenantKey: string,
  channelType: string,
  externalChatId: string
): string {
  return `${tenantKey}:${channelType}:${externalChatId}`
}

/**
 * Build the canonical user key.
 * Format: `tenantKey:externalUserId` or `tenantKey:__anon__`
 *
 * Used for rate limiting and memory scoping.
 */
export function buildUserKey(
  tenantKey: string,
  externalUserId: string | null
): string {
  const user = externalUserId || ANON_USER_SUFFIX
  return `${tenantKey}:${user}`
}

/**
 * Compute all canonical keys at once (convenience).
 * Call this early in the inbound pipeline, BEFORE lock/dedup/rate-limit.
 */
export function computeTenantKeys(params: {
  orgId: string | null
  projectId?: string | null
  envId?: string | null
  channelType: string
  externalChatId: string
  externalUserId: string | null
}): TenantKeys {
  const tenantKey = buildTenantKey(params.orgId, params.projectId, params.envId)
  const sessionKey = buildSessionKey(tenantKey, params.channelType, params.externalChatId)
  const userKey = buildUserKey(tenantKey, params.externalUserId)
  return { tenantKey, sessionKey, userKey }
}