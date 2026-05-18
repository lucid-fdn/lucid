import 'server-only'

import { ErrorService, supabase } from './client'

export interface AssistantChannelAliasRecord {
  id: string
  assistant_id: string
  channel_type: string
  surface_owner_kind: string
  surface_owner_id: string
  alias: string
  normalized_alias: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ChannelSurfaceDefaultRecord {
  id: string
  channel_type: string
  surface_owner_kind: string
  surface_owner_id: string
  assistant_id: string
  assistant_channel_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ChannelSurfaceDefaultBindingRecord {
  defaultId: string
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  assistantId: string
  assistantChannelId: string | null
  channel: {
    id: string
    assistant_id: string
    channel_type: string
    external_channel_id: string | null
    connection_mode: string | null
    channel_config: Record<string, unknown> | null
  } | null
}

function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function listAssistantChannelAliases(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  assistantIds?: string[]
}): Promise<AssistantChannelAliasRecord[]> {
  let query = supabase
    .from('assistant_channel_aliases')
    .select(
      'id, assistant_id, channel_type, surface_owner_kind, surface_owner_id, alias, normalized_alias, is_active, created_at, updated_at',
    )
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('surface_owner_id', params.surfaceOwnerId)
    .eq('is_active', true)
    .order('alias', { ascending: true })

  if (params.assistantIds && params.assistantIds.length > 0) {
    query = query.in('assistant_id', params.assistantIds)
  }

  const { data, error } = await query
  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { params, operation: 'listAssistantChannelAliases' },
        tags: { layer: 'database', table: 'assistant_channel_aliases' },
      })
    }
    return []
  }

  return data as AssistantChannelAliasRecord[]
}

export async function listAssistantChannelAliasesByAssistantId(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  assistantIds: string[]
}): Promise<Record<string, string[]>> {
  if (params.assistantIds.length === 0) {
    return {}
  }

  const rows = await listAssistantChannelAliases(params)
  const aliasesByAssistantId: Record<string, string[]> = {}

  for (const row of rows) {
    if (!aliasesByAssistantId[row.assistant_id]) {
      aliasesByAssistantId[row.assistant_id] = []
    }
    const value = row.alias.trim()
    if (value.length === 0) continue
    if (!aliasesByAssistantId[row.assistant_id]!.includes(value)) {
      aliasesByAssistantId[row.assistant_id]!.push(value)
    }
  }

  return aliasesByAssistantId
}

export async function createAssistantChannelAlias(params: {
  assistantId: string
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  alias: string
}): Promise<AssistantChannelAliasRecord> {
  const normalizedAlias = normalizeAlias(params.alias)
  const { data, error } = await supabase
    .from('assistant_channel_aliases')
    .insert({
      assistant_id: params.assistantId,
      channel_type: params.channelType,
      surface_owner_kind: params.surfaceOwnerKind,
      surface_owner_id: params.surfaceOwnerId,
      alias: params.alias.trim(),
      normalized_alias: normalizedAlias,
      is_active: true,
    })
    .select(
      'id, assistant_id, channel_type, surface_owner_kind, surface_owner_id, alias, normalized_alias, is_active, created_at, updated_at',
    )
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to create assistant channel alias'), {
      severity: 'error',
      context: { params, operation: 'createAssistantChannelAlias' },
      tags: { layer: 'database', table: 'assistant_channel_aliases' },
    })
    throw error ?? new Error('Failed to create assistant channel alias')
  }

  return data as AssistantChannelAliasRecord
}

export async function deleteAssistantChannelAlias(aliasId: string): Promise<void> {
  const { error } = await supabase
    .from('assistant_channel_aliases')
    .update({ is_active: false })
    .eq('id', aliasId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { aliasId, operation: 'deleteAssistantChannelAlias' },
      tags: { layer: 'database', table: 'assistant_channel_aliases' },
    })
    throw error
  }
}

export async function resolveAssistantChannelAlias(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  alias: string
}): Promise<AssistantChannelAliasRecord | null> {
  const normalizedAlias = normalizeAlias(params.alias)
  const { data, error } = await supabase
    .from('assistant_channel_aliases')
    .select(
      'id, assistant_id, channel_type, surface_owner_kind, surface_owner_id, alias, normalized_alias, is_active, created_at, updated_at',
    )
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('surface_owner_id', params.surfaceOwnerId)
    .eq('normalized_alias', normalizedAlias)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { params, operation: 'resolveAssistantChannelAlias' },
        tags: { layer: 'database', table: 'assistant_channel_aliases' },
      })
    }
    return null
  }

  return data as AssistantChannelAliasRecord
}

export async function getChannelSurfaceDefault(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
}): Promise<ChannelSurfaceDefaultRecord | null> {
  const { data, error } = await supabase
    .from('channel_surface_defaults')
    .select(
      'id, channel_type, surface_owner_kind, surface_owner_id, assistant_id, assistant_channel_id, is_active, created_at, updated_at',
    )
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('surface_owner_id', params.surfaceOwnerId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { params, operation: 'getChannelSurfaceDefault' },
        tags: { layer: 'database', table: 'channel_surface_defaults' },
      })
    }
    return null
  }

  return data as ChannelSurfaceDefaultRecord
}

export async function setChannelSurfaceDefault(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  assistantId: string
  assistantChannelId?: string | null
}): Promise<ChannelSurfaceDefaultRecord> {
  if (params.assistantChannelId) {
    const { data: channel, error: channelError } = await supabase
      .from('assistant_channels')
      .select('id, assistant_id, channel_type, is_active')
      .eq('id', params.assistantChannelId)
      .maybeSingle()

    if (
      channelError ||
      !channel ||
      channel.assistant_id !== params.assistantId ||
      channel.channel_type !== params.channelType ||
      channel.is_active !== true
    ) {
      const validationError =
        channelError ?? new Error('Surface default assistant channel validation failed')
      ErrorService.captureException(validationError, {
        severity: 'error',
        context: { params, operation: 'setChannelSurfaceDefault.validateChannel' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw validationError
    }
  }

  const current = await getChannelSurfaceDefault(params)
  const payload = {
    channel_type: params.channelType,
    surface_owner_kind: params.surfaceOwnerKind,
    surface_owner_id: params.surfaceOwnerId,
    assistant_id: params.assistantId,
    assistant_channel_id: params.assistantChannelId ?? null,
    is_active: true,
  }

  const query = current
    ? supabase
        .from('channel_surface_defaults')
        .update(payload)
        .eq('id', current.id)
    : supabase.from('channel_surface_defaults').insert(payload)

  const { data, error } = await query
    .select(
      'id, channel_type, surface_owner_kind, surface_owner_id, assistant_id, assistant_channel_id, is_active, created_at, updated_at',
    )
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to set channel surface default'), {
      severity: 'error',
      context: { params, operation: 'setChannelSurfaceDefault' },
      tags: { layer: 'database', table: 'channel_surface_defaults' },
    })
    throw error ?? new Error('Failed to set channel surface default')
  }

  return data as ChannelSurfaceDefaultRecord
}

export async function clearChannelSurfaceDefault(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
}): Promise<void> {
  const { error } = await supabase
    .from('channel_surface_defaults')
    .update({ is_active: false })
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('surface_owner_id', params.surfaceOwnerId)
    .eq('is_active', true)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { params, operation: 'clearChannelSurfaceDefault' },
      tags: { layer: 'database', table: 'channel_surface_defaults' },
    })
    throw error
  }
}

export async function getChannelSurfaceDefaultBinding(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
}): Promise<ChannelSurfaceDefaultBindingRecord | null> {
  const { data, error } = await supabase
    .from('channel_surface_defaults')
    .select(`
      id,
      channel_type,
      surface_owner_kind,
      surface_owner_id,
      assistant_id,
      assistant_channel_id,
      assistant_channels:assistant_channel_id (
        id,
        assistant_id,
        channel_type,
        external_channel_id,
        connection_mode,
        channel_config
      )
    `)
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('surface_owner_id', params.surfaceOwnerId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { params, operation: 'getChannelSurfaceDefaultBinding' },
        tags: { layer: 'database', table: 'channel_surface_defaults' },
      })
    }
    return null
  }

  const assistantChannels = (data as { assistant_channels?: unknown }).assistant_channels
  const channel = Array.isArray(assistantChannels)
    ? (assistantChannels[0] as Record<string, unknown> | undefined) ?? null
    : ((assistantChannels as Record<string, unknown> | null | undefined) ?? null)

  return {
    defaultId: (data as { id: string }).id,
    channelType: (data as { channel_type: string }).channel_type,
    surfaceOwnerKind: (data as { surface_owner_kind: string }).surface_owner_kind,
    surfaceOwnerId: (data as { surface_owner_id: string }).surface_owner_id,
    assistantId: (data as { assistant_id: string }).assistant_id,
    assistantChannelId: (data as { assistant_channel_id: string | null }).assistant_channel_id,
    channel: channel
      ? {
          id: String(channel.id),
          assistant_id: String(channel.assistant_id),
          channel_type: String(channel.channel_type),
          external_channel_id:
            typeof channel.external_channel_id === 'string' ? channel.external_channel_id : null,
          connection_mode:
            typeof channel.connection_mode === 'string' ? channel.connection_mode : null,
          channel_config:
            channel.channel_config && typeof channel.channel_config === 'object'
              ? (channel.channel_config as Record<string, unknown>)
              : null,
        }
      : null,
  }
}

export async function listChannelSurfaceDefaultBindings(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerIds: string[]
}): Promise<ChannelSurfaceDefaultBindingRecord[]> {
  const normalizedSurfaceOwnerIds = Array.from(
    new Set(
      params.surfaceOwnerIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  )

  if (normalizedSurfaceOwnerIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('channel_surface_defaults')
    .select(`
      id,
      channel_type,
      surface_owner_kind,
      surface_owner_id,
      assistant_id,
      assistant_channel_id,
      assistant_channels:assistant_channel_id (
        id,
        assistant_id,
        channel_type,
        external_channel_id,
        connection_mode,
        channel_config
      )
    `)
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('is_active', true)
    .in('surface_owner_id', normalizedSurfaceOwnerIds)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { params, operation: 'listChannelSurfaceDefaultBindings' },
        tags: { layer: 'database', table: 'channel_surface_defaults' },
      })
    }
    return []
  }

  return data.map((row) => {
    const assistantChannels = (row as { assistant_channels?: unknown }).assistant_channels
    const channel = Array.isArray(assistantChannels)
      ? (assistantChannels[0] as Record<string, unknown> | undefined) ?? null
      : ((assistantChannels as Record<string, unknown> | null | undefined) ?? null)

    return {
      defaultId: (row as { id: string }).id,
      channelType: (row as { channel_type: string }).channel_type,
      surfaceOwnerKind: (row as { surface_owner_kind: string }).surface_owner_kind,
      surfaceOwnerId: (row as { surface_owner_id: string }).surface_owner_id,
      assistantId: (row as { assistant_id: string }).assistant_id,
      assistantChannelId: (row as { assistant_channel_id: string | null }).assistant_channel_id,
      channel: channel
        ? {
            id: String(channel.id),
            assistant_id: String(channel.assistant_id),
            channel_type: String(channel.channel_type),
            external_channel_id:
              typeof channel.external_channel_id === 'string' ? channel.external_channel_id : null,
            connection_mode:
              typeof channel.connection_mode === 'string' ? channel.connection_mode : null,
            channel_config:
              channel.channel_config && typeof channel.channel_config === 'object'
                ? (channel.channel_config as Record<string, unknown>)
                : null,
          }
        : null,
    }
  })
}
