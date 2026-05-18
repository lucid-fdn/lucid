import 'server-only'

import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import {
  createAssistantChannelAlias,
  deleteAssistantChannelAlias,
  listAssistantChannelAliases,
  resolveAssistantChannelAlias,
} from '@/lib/db/channel-routing'
import { createServiceClient } from '@/lib/supabase/server'

export class ChannelAdminRouteError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireAssistantChannelAdminAccess(assistantId: string) {
  const userId = await getUserId()
  if (!userId) {
    throw new ChannelAdminRouteError(401, 'Unauthorized')
  }

  const assistant = await getAssistant(assistantId)
  if (!assistant) {
    throw new ChannelAdminRouteError(404, 'Assistant not found')
  }

  const isMember = await isUserOrgMember(userId, assistant.org_id)
  if (!isMember) {
    throw new ChannelAdminRouteError(403, 'Forbidden')
  }

  return { userId, assistant }
}

export async function buildAssistantAliasMap(params: {
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  assistantIds: string[]
}) {
  const aliasRows = await listAssistantChannelAliases(params)
  const aliasesByAssistantId = new Map<string, Array<{ id: string; alias: string }>>()

  for (const row of aliasRows) {
    const nextAliases = aliasesByAssistantId.get(row.assistant_id) ?? []
    nextAliases.push({ id: row.id, alias: row.alias })
    aliasesByAssistantId.set(row.assistant_id, nextAliases)
  }

  return aliasesByAssistantId
}

export async function createChannelAliasWithConflictCheck(params: {
  assistantId: string
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
  alias: string
}) {
  const existing = await resolveAssistantChannelAlias({
    channelType: params.channelType,
    surfaceOwnerKind: params.surfaceOwnerKind,
    surfaceOwnerId: params.surfaceOwnerId,
    alias: params.alias,
  })

  if (existing) {
    return {
      ok: false as const,
      existingAssistantId: existing.assistant_id,
    }
  }

  let alias
  try {
    alias = await createAssistantChannelAlias({
      assistantId: params.assistantId,
      channelType: params.channelType,
      surfaceOwnerKind: params.surfaceOwnerKind,
      surfaceOwnerId: params.surfaceOwnerId,
      alias: params.alias,
    })
  } catch (error) {
    const isUniqueViolation =
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'

    if (!isUniqueViolation) {
      throw error
    }

    const conflictingAlias = await resolveAssistantChannelAlias({
      channelType: params.channelType,
      surfaceOwnerKind: params.surfaceOwnerKind,
      surfaceOwnerId: params.surfaceOwnerId,
      alias: params.alias,
    })

    if (conflictingAlias) {
      return {
        ok: false as const,
        existingAssistantId: conflictingAlias.assistant_id,
      }
    }

    throw error
  }

  return {
    ok: true as const,
    alias,
  }
}

export async function ensureChannelAliasOwnership(params: {
  aliasId: string
  assistantId: string
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
}) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('assistant_channel_aliases')
    .select('id, assistant_id')
    .eq('id', params.aliasId)
    .eq('assistant_id', params.assistantId)
    .eq('channel_type', params.channelType)
    .eq('surface_owner_kind', params.surfaceOwnerKind)
    .eq('surface_owner_id', params.surfaceOwnerId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    return false
  }

  return true
}

export async function deleteOwnedChannelAlias(params: {
  aliasId: string
  assistantId: string
  channelType: string
  surfaceOwnerKind: string
  surfaceOwnerId: string
}) {
  const owned = await ensureChannelAliasOwnership(params)
  if (!owned) {
    return false
  }

  await deleteAssistantChannelAlias(params.aliasId)
  return true
}
