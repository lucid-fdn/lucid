import 'server-only'

import type {
  ExternalKnowledgeClient,
  ExternalKnowledgeClientManifest,
  KnowledgeAuthScope,
} from '@contracts/knowledge-auth'
import { toExternalKnowledgeClientManifest } from '@/lib/knowledge/external-client-manifest'
import {
  generateExternalKnowledgeToken,
  hashExternalKnowledgeToken,
} from '@/lib/knowledge/token-issuer'
import { ErrorService, supabase } from './client'

const CLIENT_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'name',
  'scopes',
  'status',
  'expires_at',
  'revoked_at',
  'last_used_at',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const CLIENT_COLUMNS_LEGACY = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'name',
  'scopes',
  'status',
  'expires_at',
  'last_used_at',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

type ExternalClientRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  name: string
  scopes: KnowledgeAuthScope[] | null
  status: ExternalKnowledgeClient['status']
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function isMissingRevokedAtColumn(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '')
  return message.includes('knowledge_external_clients.revoked_at') || message.includes("column \"revoked_at\" does not exist")
}

function withLegacyRevokedAt(row: unknown): ExternalClientRow {
  const record = row as ExternalClientRow & { revoked_at?: string | null }
  return { ...record, revoked_at: record.revoked_at ?? null }
}

export async function createExternalKnowledgeClient(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  name: string
  scopes: KnowledgeAuthScope[]
  expiresAt?: string | null
  metadata?: Record<string, unknown>
  createdByUserId?: string | null
}): Promise<{ client: ExternalKnowledgeClient; token: string; manifest: ExternalKnowledgeClientManifest }> {
  const token = generateExternalKnowledgeToken()
  const tokenHash = hashExternalKnowledgeToken(token)
  let { data, error } = await supabase
    .from('knowledge_external_clients')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      team_id: input.teamId ?? null,
      name: input.name,
      token_hash: tokenHash,
      scopes: input.scopes,
      status: 'active',
      expires_at: input.expiresAt ?? null,
      metadata: input.metadata ?? {},
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select(CLIENT_COLUMNS)
    .single()

  if (error && isMissingRevokedAtColumn(error)) {
    const legacyResult = await supabase
      .from('knowledge_external_clients')
      .select(CLIENT_COLUMNS_LEGACY)
      .eq('token_hash', tokenHash)
      .single()
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, name: input.name, operation: 'createExternalKnowledgeClient' },
      tags: { layer: 'database', table: 'knowledge_external_clients' },
    })
    throw error
  }

  const client = mapExternalClient(withLegacyRevokedAt(data))
  return {
    client,
    token,
    manifest: toExternalKnowledgeClientManifest(client),
  }
}

export async function listExternalKnowledgeClients(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  status?: ExternalKnowledgeClient['status']
  limit?: number
}): Promise<ExternalKnowledgeClient[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('knowledge_external_clients')
    .select(CLIENT_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    if (isMissingRevokedAtColumn(error)) {
      let legacyQuery = supabase
        .from('knowledge_external_clients')
        .select(CLIENT_COLUMNS_LEGACY)
        .eq('org_id', input.orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (input.projectId) legacyQuery = legacyQuery.eq('project_id', input.projectId)
      if (input.teamId) legacyQuery = legacyQuery.eq('team_id', input.teamId)
      if (input.status) legacyQuery = legacyQuery.eq('status', input.status)

      const legacyResult = await legacyQuery
      if (!legacyResult.error) {
        return ((legacyResult.data ?? []) as unknown[]).map(withLegacyRevokedAt).map(mapExternalClient)
      }
    }

    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listExternalKnowledgeClients' },
      tags: { layer: 'database', table: 'knowledge_external_clients' },
    })
    return []
  }

  return ((data ?? []) as unknown as ExternalClientRow[]).map(mapExternalClient)
}

export async function revokeExternalKnowledgeClient(input: {
  orgId: string
  clientId: string
}): Promise<ExternalKnowledgeClient | null> {
  let { data, error } = await supabase
    .from('knowledge_external_clients')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('org_id', input.orgId)
    .eq('id', input.clientId)
    .select(CLIENT_COLUMNS)
    .single()

  if (error && isMissingRevokedAtColumn(error)) {
    const legacyResult = await supabase
      .from('knowledge_external_clients')
      .update({ status: 'revoked' })
      .eq('org_id', input.orgId)
      .eq('id', input.clientId)
      .select(CLIENT_COLUMNS_LEGACY)
      .single()
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, clientId: input.clientId, operation: 'revokeExternalKnowledgeClient' },
      tags: { layer: 'database', table: 'knowledge_external_clients' },
    })
    return null
  }

  return mapExternalClient(withLegacyRevokedAt(data))
}

export async function verifyExternalKnowledgeToken(input: {
  token: string
  requiredScopes?: KnowledgeAuthScope[]
  touch?: boolean
}): Promise<ExternalKnowledgeClient | null> {
  const tokenHash = hashExternalKnowledgeToken(input.token)
  let { data, error } = await supabase
    .from('knowledge_external_clients')
    .select(CLIENT_COLUMNS)
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle()

  if (error && isMissingRevokedAtColumn(error)) {
    const legacyResult = await supabase
      .from('knowledge_external_clients')
      .select(CLIENT_COLUMNS_LEGACY)
      .eq('token_hash', tokenHash)
      .eq('status', 'active')
      .maybeSingle()
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error || !data) return null
  const client = mapExternalClient(withLegacyRevokedAt(data))
  if (client.expiresAt && new Date(client.expiresAt).getTime() < Date.now()) return null
  const scopes = new Set(client.scopes)
  if (input.requiredScopes?.some((scope) => !scopes.has(scope))) return null

  if (input.touch !== false) {
    await markExternalKnowledgeClientUsed(client.id)
  }

  return client
}

export async function markExternalKnowledgeClientUsed(clientId: string): Promise<void> {
  await supabase
    .from('knowledge_external_clients')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', clientId)
}

function mapExternalClient(row: ExternalClientRow): ExternalKnowledgeClient {
  return {
    schemaVersion: '2026-05-07.external-knowledge-client.v1',
    id: row.id,
    clientId: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    name: row.name,
    scopes: row.scopes ?? [],
    status: row.status,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
