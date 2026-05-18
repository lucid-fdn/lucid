import 'server-only'

import { NextResponse } from 'next/server'

import { getServerSession } from '@/lib/auth/session'
import { cacheStore } from '@/lib/auth/cache'
import { supabase } from '@/lib/db/client'
import {
  ROLE_PERMISSIONS,
  type RolePermissions,
  type WorkspaceRole,
} from '@/lib/access-control/types'

export type OrgRequestContext = {
  userId: string
  orgId: string
  role: WorkspaceRole
  permissions: RolePermissions
  org: OrgSummary | null
  can: (permission: keyof RolePermissions) => boolean
  timings: {
    auth_ms: number
    access_ms: number
    total_ms: number
    access_source: 'memory' | 'distributed' | 'database' | 'inflight'
  }
}

export type OrgSummary = {
  id: string
  slug: string | null
  name: string | null
  logo_url: string | null
}

type OrgAccessRecord = {
  role: WorkspaceRole
  org: OrgSummary | null
}

type OrgRequestContextResult =
  | { ok: true; context: OrgRequestContext }
  | { ok: false; response: NextResponse }

const ORG_REQUEST_CONTEXT_CACHE_TTL_MS = 5 * 60_000

type OrgAccessGlobalCache = {
  memory: Map<string, {
    expiresAt: number
    value: OrgAccessRecord
  }>
  inflight: Map<string, Promise<OrgAccessRecord>>
}

const orgAccessGlobalCache = getOrgAccessGlobalCache()

function getOrgAccessGlobalCache(): OrgAccessGlobalCache {
  const globalForCache = globalThis as typeof globalThis & {
    __lucidOrgAccessContextCache?: OrgAccessGlobalCache
  }
  if (!globalForCache.__lucidOrgAccessContextCache) {
    globalForCache.__lucidOrgAccessContextCache = {
      memory: new Map(),
      inflight: new Map(),
    }
  }
  return globalForCache.__lucidOrgAccessContextCache
}

export async function getOrgRequestContext(input: {
  orgId: string
  permission?: keyof RolePermissions
  userId?: string
}): Promise<OrgRequestContextResult> {
  const startedAt = Date.now()
  const authStartedAt = Date.now()
  const session = input.userId ? { userId: input.userId } : await getServerSession()
  const authReadyAt = Date.now()

  if (!session.userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const accessStartedAt = Date.now()
  const access = await getOrgAccessRecord(session.userId, input.orgId)
  const accessReadyAt = Date.now()
  if (!access.value.org) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const permissions = ROLE_PERMISSIONS[access.value.role] ?? ROLE_PERMISSIONS.guest

  if (input.permission && !permissions[input.permission]) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return {
    ok: true,
    context: {
      userId: session.userId,
      orgId: input.orgId,
      role: access.value.role,
      permissions,
      org: access.value.org,
      can: (permission) => Boolean(permissions[permission]),
      timings: {
        auth_ms: authReadyAt - authStartedAt,
        access_ms: accessReadyAt - accessStartedAt,
        total_ms: Date.now() - startedAt,
        access_source: access.source,
      },
    },
  }
}

export async function requireOrgRequestContext(input: {
  orgId: string
  permission?: keyof RolePermissions
  userId?: string
}): Promise<OrgRequestContextResult> {
  return getOrgRequestContext(input)
}

async function getOrgAccessRecord(
  userId: string,
  orgId: string,
): Promise<{ value: OrgAccessRecord; source: OrgRequestContext['timings']['access_source'] }> {
  const cacheKey = `${userId}:${orgId}`
  const memoryCached = orgAccessGlobalCache.memory.get(cacheKey)
  if (memoryCached && memoryCached.expiresAt > Date.now()) {
    return { value: memoryCached.value, source: 'memory' }
  }

  const distributedKey = `org-context:${cacheKey}`
  const distributedCached = await cacheStore.get(distributedKey)
  if (isOrgAccessRecord(distributedCached)) {
    orgAccessGlobalCache.memory.set(cacheKey, {
      expiresAt: Date.now() + ORG_REQUEST_CONTEXT_CACHE_TTL_MS,
      value: distributedCached,
    })
    return { value: distributedCached, source: 'distributed' }
  }

  const existing = orgAccessGlobalCache.inflight.get(cacheKey)
  if (existing) {
    return { value: await existing, source: 'inflight' }
  }

  const inflight = loadOrgAccessRecord(userId, orgId)
  orgAccessGlobalCache.inflight.set(cacheKey, inflight)
  try {
    const value = await inflight
    orgAccessGlobalCache.memory.set(cacheKey, {
      expiresAt: Date.now() + ORG_REQUEST_CONTEXT_CACHE_TTL_MS,
      value,
    })
    await cacheStore.set(distributedKey, value, Math.ceil(ORG_REQUEST_CONTEXT_CACHE_TTL_MS / 1000))
    return { value, source: 'database' }
  } finally {
    orgAccessGlobalCache.inflight.delete(cacheKey)
  }
}

export async function primeOrgRequestContextAccess(input: {
  userId: string
  orgId: string
  role: unknown
  org?: OrgSummary | null
}): Promise<void> {
  const role = normalizeWorkspaceRole(input.role)
  const value: OrgAccessRecord = {
    role,
    org: input.org ?? null,
  }
  const cacheKey = `${input.userId}:${input.orgId}`
  orgAccessGlobalCache.memory.set(cacheKey, {
    expiresAt: Date.now() + ORG_REQUEST_CONTEXT_CACHE_TTL_MS,
    value,
  })
  await cacheStore.set(
    `org-context:${cacheKey}`,
    value,
    Math.ceil(ORG_REQUEST_CONTEXT_CACHE_TTL_MS / 1000),
  )
}

async function loadOrgAccessRecord(userId: string, orgId: string): Promise<OrgAccessRecord> {
  const { data } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations!organization_members_organization_id_fkey(id, slug, name, logo_url)
    `)
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .single()

  const role = data?.role
  const organization = normalizeOrganization(data?.organization)
  return {
    role: normalizeWorkspaceRole(role),
    org: organization,
  }
}

function normalizeOrganization(value: unknown): OrgSummary | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || typeof raw !== 'object') return null
  const org = raw as Record<string, unknown>
  if (typeof org.id !== 'string') return null
  return {
    id: org.id,
    slug: typeof org.slug === 'string' ? org.slug : null,
    name: typeof org.name === 'string' ? org.name : null,
    logo_url: typeof org.logo_url === 'string' ? org.logo_url : null,
  }
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'guest'
}

function normalizeWorkspaceRole(value: unknown): WorkspaceRole {
  if (isWorkspaceRole(value)) return value
  if (value === 'developer' || value === 'analyst' || value === 'billing') return 'member'
  return 'guest'
}

function isOrgAccessRecord(value: unknown): value is OrgAccessRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return isWorkspaceRole(record.role) && (record.org === null || normalizeOrganization(record.org) !== null)
}
