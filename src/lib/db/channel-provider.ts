import 'server-only'

import crypto from 'crypto'
import { ErrorService, supabase } from './client'
import { hashChannelSecret } from '@/lib/channels/secrets'

export interface ChannelProviderNodeRecord {
  id: string
  channel_type: string
  org_id: string | null
  node_key_hash: string
  label: string | null
  status: string
  version: string | null
  capabilities: Record<string, unknown> | null
  last_heartbeat_at: string | null
  last_probe_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface ChannelProviderSurfaceRecord {
  id: string
  channel_type: string
  org_id: string
  provider_node_id: string | null
  surface_owner_id: string
  display_name: string | null
  status: string
  config: Record<string, unknown> | null
  secret_token_hash: string | null
  last_heartbeat_at: string | null
  last_probe_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface ChannelProviderDispatchRecord {
  id: string
  channel_type: string
  surface_id: string
  assistant_outbound_event_id: string
  payload: Record<string, unknown> | null
  status: string
  attempt_count: number
  claimed_by_node_id: string | null
  claimed_at: string | null
  last_error: string | null
  external_message_id: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

const CHANNEL_PROVIDER_SURFACE_SELECT =
  'id, channel_type, org_id, provider_node_id, surface_owner_id, display_name, status, config, secret_token_hash, last_heartbeat_at, last_probe_at, last_error, created_at, updated_at' as const

const CHANNEL_PROVIDER_NODE_SELECT =
  'id, channel_type, org_id, node_key_hash, label, status, version, capabilities, last_heartbeat_at, last_probe_at, last_error, created_at, updated_at' as const

const CHANNEL_PROVIDER_DISPATCH_SELECT =
  'id, channel_type, surface_id, assistant_outbound_event_id, payload, status, attempt_count, claimed_by_node_id, claimed_at, last_error, external_message_id, delivered_at, created_at, updated_at' as const

function hashNodeKey(nodeKey: string): string {
  return crypto.createHash('sha256').update(nodeKey).digest('hex')
}

export function createProviderNodeKey(): string {
  return crypto.randomUUID()
}

export function createProviderSurfaceToken(): string {
  return crypto.randomUUID()
}

export async function ensureChannelProviderSurface(params: {
  channelType: string
  orgId: string
  surfaceOwnerId: string
  displayName?: string | null
  status?: string
  config?: Record<string, unknown>
  secretToken?: string
}): Promise<ChannelProviderSurfaceRecord> {
  const nextPayload: Record<string, unknown> = {
    channel_type: params.channelType,
    org_id: params.orgId,
    surface_owner_id: params.surfaceOwnerId,
    display_name: params.displayName ?? null,
    status: params.status ?? 'pending',
    config: params.config ?? {},
    updated_at: new Date().toISOString(),
  }

  if (params.secretToken) {
    nextPayload.secret_token_hash = hashChannelSecret(params.secretToken)
  }

  const { data, error } = await supabase
    .from('channel_provider_surfaces')
    .upsert(nextPayload, {
      onConflict: 'channel_type,org_id,surface_owner_id',
    })
    .select(CHANNEL_PROVIDER_SURFACE_SELECT)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to ensure channel provider surface'), {
      severity: 'error',
      context: { params, operation: 'ensureChannelProviderSurface' },
      tags: { layer: 'database', table: 'channel_provider_surfaces' },
    })
    throw error ?? new Error('Failed to ensure channel provider surface')
  }

  return data as ChannelProviderSurfaceRecord
}

export async function getChannelProviderSurface(params: {
  channelType: string
  orgId?: string
  surfaceId?: string
  surfaceOwnerId?: string
}): Promise<ChannelProviderSurfaceRecord | null> {
  let query = supabase.from('channel_provider_surfaces').select(CHANNEL_PROVIDER_SURFACE_SELECT).eq('channel_type', params.channelType)

  if (params.surfaceId) {
    query = query.eq('id', params.surfaceId)
  }
  if (params.orgId) {
    query = query.eq('org_id', params.orgId)
  }
  if (params.surfaceOwnerId) {
    query = query.eq('surface_owner_id', params.surfaceOwnerId)
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { params, operation: 'getChannelProviderSurface' },
        tags: { layer: 'database', table: 'channel_provider_surfaces' },
      })
    }
    return null
  }

  return data as ChannelProviderSurfaceRecord
}

export async function verifyChannelProviderSurfaceToken(params: {
  surfaceId: string
  token: string
  channelType: string
}): Promise<ChannelProviderSurfaceRecord | null> {
  const surface = await getChannelProviderSurface({
    channelType: params.channelType,
    surfaceId: params.surfaceId,
  })
  if (!surface?.secret_token_hash) {
    return null
  }
  return surface.secret_token_hash === hashChannelSecret(params.token) ? surface : null
}

export async function upsertChannelProviderNode(params: {
  channelType: string
  nodeKey: string
  orgId?: string | null
  label?: string | null
  status?: string
  version?: string | null
  capabilities?: Record<string, unknown>
  lastError?: string | null
}): Promise<ChannelProviderNodeRecord> {
  const nodeKeyHash = hashNodeKey(params.nodeKey)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('channel_provider_nodes')
    .upsert(
      {
        channel_type: params.channelType,
        org_id: params.orgId ?? null,
        node_key_hash: nodeKeyHash,
        label: params.label ?? null,
        status: params.status ?? 'active',
        version: params.version ?? null,
        capabilities: params.capabilities ?? {},
        last_error: params.lastError ?? null,
        last_heartbeat_at: now,
        updated_at: now,
      },
      { onConflict: 'node_key_hash' },
    )
    .select(CHANNEL_PROVIDER_NODE_SELECT)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to upsert channel provider node'), {
      severity: 'error',
      context: { params: { ...params, nodeKey: '[redacted]' }, operation: 'upsertChannelProviderNode' },
      tags: { layer: 'database', table: 'channel_provider_nodes' },
    })
    throw error ?? new Error('Failed to upsert channel provider node')
  }

  return data as ChannelProviderNodeRecord
}

export async function attachChannelProviderSurfaceToNode(params: {
  surfaceId: string
  nodeId: string
  status?: string
}): Promise<void> {
  const { error } = await supabase
    .from('channel_provider_surfaces')
    .update({
      provider_node_id: params.nodeId,
      status: params.status ?? 'connected',
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.surfaceId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { params, operation: 'attachChannelProviderSurfaceToNode' },
      tags: { layer: 'database', table: 'channel_provider_surfaces' },
    })
    throw error
  }
}

export async function markChannelProviderSurfaceProbe(params: {
  surfaceId: string
  status?: string
  lastError?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('channel_provider_surfaces')
    .update({
      status: params.status ?? 'connected',
      last_probe_at: new Date().toISOString(),
      last_error: params.lastError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.surfaceId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { params, operation: 'markChannelProviderSurfaceProbe' },
      tags: { layer: 'database', table: 'channel_provider_surfaces' },
    })
  }
}

export async function enqueueChannelProviderDispatch(params: {
  channelType: string
  surfaceId: string
  assistantOutboundEventId: string
  payload: Record<string, unknown>
}): Promise<ChannelProviderDispatchRecord> {
  const { data, error } = await supabase
    .from('channel_provider_dispatches')
    .upsert(
      {
        channel_type: params.channelType,
        surface_id: params.surfaceId,
        assistant_outbound_event_id: params.assistantOutboundEventId,
        payload: params.payload,
        status: 'pending',
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assistant_outbound_event_id' },
    )
    .select(CHANNEL_PROVIDER_DISPATCH_SELECT)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to enqueue channel provider dispatch'), {
      severity: 'error',
      context: { params, operation: 'enqueueChannelProviderDispatch' },
      tags: { layer: 'database', table: 'channel_provider_dispatches' },
    })
    throw error ?? new Error('Failed to enqueue channel provider dispatch')
  }

  return data as ChannelProviderDispatchRecord
}

export async function claimNextChannelProviderDispatch(params: {
  channelType: string
  surfaceId: string
  nodeId: string
}): Promise<ChannelProviderDispatchRecord | null> {
  const { data, error } = await supabase.rpc('claim_next_channel_provider_dispatch', {
    p_channel_type: params.channelType,
    p_surface_id: params.surfaceId,
    p_node_id: params.nodeId,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { params, operation: 'claimNextChannelProviderDispatch' },
      tags: { layer: 'database', table: 'channel_provider_dispatches' },
    })
    throw error
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null
  }

  return data[0] as ChannelProviderDispatchRecord
}

export async function acknowledgeChannelProviderDispatch(params: {
  dispatchId: string
  status: 'delivered' | 'retry' | 'failed'
  externalMessageId?: string | null
  lastError?: string | null
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
    last_error: params.lastError ?? null,
  }

  if (params.status === 'delivered') {
    patch.delivered_at = new Date().toISOString()
    patch.external_message_id = params.externalMessageId ?? null
  } else {
    patch.claimed_by_node_id = null
    patch.claimed_at = null
  }

  const { error } = await supabase
    .from('channel_provider_dispatches')
    .update(patch)
    .eq('id', params.dispatchId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { params, operation: 'acknowledgeChannelProviderDispatch' },
      tags: { layer: 'database', table: 'channel_provider_dispatches' },
    })
    throw error
  }
}
