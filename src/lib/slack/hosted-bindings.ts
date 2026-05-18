import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptChannelSecrets } from '@/lib/channels/secrets'
import { listAssistantChannelAliases } from '@/lib/db/channel-routing'

type JsonObject = Record<string, unknown>

type AssistantJoin =
  | { name?: string | null; description?: string | null }
  | Array<{ name?: string | null; description?: string | null }>
  | null

interface SlackAssistantChannelRow {
  id: string
  assistant_id: string
  secret_token_hash?: string | null
  encrypted_secrets_id?: string | null
  external_channel_id: string | null
  webhook_url?: string | null
  is_active: boolean
  is_primary: boolean | null
  channel_config: JsonObject | null
  inbound_routing_config: JsonObject | null
  created_at: string | null
  encrypted_secrets?: { encrypted_data?: string | null } | Array<{ encrypted_data?: string | null }> | null
  ai_assistants: AssistantJoin
}

export interface SlackHostedAssistantBinding {
  id: string
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  externalChannelId: string | null
  isActive: boolean
  isPrimary: boolean
  channelConfig: JsonObject | null
  inboundRoutingConfig: JsonObject | null
  createdAt: string | null
  botToken: string | null
  teamId: string | null
  teamName: string | null
}

const HOSTED_SLACK_SELECT =
  'id, assistant_id, secret_token_hash, encrypted_secrets_id, external_channel_id, webhook_url, is_active, is_primary, channel_config, inbound_routing_config, created_at, encrypted_secrets:encrypted_secrets_id(encrypted_data), ai_assistants(name, description)'

export interface SlackHostedConversation {
  id: string
  name: string
  label: string
  type: 'public' | 'private' | 'mpim' | 'im'
  isPrivate: boolean
}

export interface SlackHostedUser {
  id: string
  name: string
  displayName: string
  avatarUrl: string | null
}

export interface SlackHostedWorkspaceAgentAlias {
  id: string
  alias: string
}

export interface SlackHostedWorkspaceAgentSummary {
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  installChannelId: string
  aliases: SlackHostedWorkspaceAgentAlias[]
  boundConversationCount: number
  workspaceWideEnabled: boolean
}

type SlackUserProfile = {
  ok?: boolean
  error?: string
  user?: {
    id?: string
    name?: string
    real_name?: string
    profile?: {
      display_name?: string
      real_name?: string
    }
  }
}

type SlackUsersListResponse = {
  ok?: boolean
  error?: string
  members?: Array<{
    id?: string
    deleted?: boolean
    is_bot?: boolean
    is_app_user?: boolean
    real_name?: string
    name?: string
    profile?: {
      display_name?: string
      real_name?: string
      image_original?: string
      image_1024?: string
      image_24?: string
      image_32?: string
      image_48?: string
      image_72?: string
      image_192?: string
      image_512?: string
    }
  }>
  response_metadata?: { next_cursor?: string }
}

export interface SlackHostedActivitySnapshot {
  lastInboundAt: string | null
  lastInboundStatus: string | null
  lastOutboundAt: string | null
  lastOutboundStatus: string | null
  lastOutboundError: string | null
  lastReplyLatencyMs: number | null
}

export const DEFAULT_HOSTED_SLACK_TYPING_REACTION = 'hourglass_flowing_sand'
export const DEFAULT_HOSTED_SLACK_ACK_REACTION = 'eyes'

export interface SlackHostedRoutingConfig extends JsonObject {
  dedicated_channel: boolean
  prefix: string | null
  respond_on_mention: boolean
  thread_support: boolean
  ignore_bots: boolean
}

export type SlackHostedThreadHistoryScope = 'thread' | 'channel'
export type SlackHostedReplyToMode = 'off' | 'first' | 'all'
export type SlackHostedStreamingMode = 'off' | 'partial' | 'block' | 'progress'

export function normalizeHostedSlackTypingReaction(current: JsonObject | null): string | null {
  if (!current || typeof current !== 'object') {
    return DEFAULT_HOSTED_SLACK_TYPING_REACTION
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'slack_typing_reaction')) {
    return DEFAULT_HOSTED_SLACK_TYPING_REACTION
  }
  const rawValue = current.slack_typing_reaction
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    return rawValue.trim()
  }
  return null
}

export function normalizeHostedSlackAckReaction(current: JsonObject | null): string | null {
  if (!current || typeof current !== 'object') {
    return DEFAULT_HOSTED_SLACK_ACK_REACTION
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'slack_ack_reaction')) {
    return DEFAULT_HOSTED_SLACK_ACK_REACTION
  }
  const rawValue = current.slack_ack_reaction
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    return rawValue.trim()
  }
  return null
}

export function normalizeHostedSlackStreamingPreview(current: JsonObject | null): boolean {
  if (!current || typeof current !== 'object') {
    return true
  }
  return current.slack_streaming_preview !== false
}

export function normalizeHostedSlackStreamingMode(
  current: JsonObject | null,
): SlackHostedStreamingMode {
  if (!current || typeof current !== 'object') {
    return 'partial'
  }
  const mode = current.slack_streaming_mode
  if (mode === 'off' || mode === 'partial' || mode === 'block' || mode === 'progress') {
    return mode
  }
  return current.slack_streaming_preview === false ? 'off' : 'partial'
}

export function normalizeHostedSlackNativeStreaming(current: JsonObject | null): boolean {
  if (!current || typeof current !== 'object') {
    return false
  }
  return current.slack_native_streaming === true
}

export function normalizeHostedSlackThreadHistoryScope(
  current: JsonObject | null,
): SlackHostedThreadHistoryScope {
  if (!current || typeof current !== 'object') {
    return 'thread'
  }
  return current.slack_thread_history_scope === 'channel' ? 'channel' : 'thread'
}

export function normalizeHostedSlackThreadInheritParent(current: JsonObject | null): boolean {
  if (!current || typeof current !== 'object') {
    return false
  }
  return current.slack_thread_inherit_parent === true
}

export function normalizeHostedSlackThreadInitialHistoryLimit(
  current: JsonObject | null,
): number | null {
  if (!current || typeof current !== 'object') {
    return null
  }
  const rawValue = current.slack_thread_initial_history_limit
  if (typeof rawValue !== 'number' || !Number.isInteger(rawValue) || rawValue < 0) {
    return null
  }
  return rawValue
}

export function normalizeHostedSlackReplyToMode(
  current: JsonObject | null,
): SlackHostedReplyToMode {
  if (!current || typeof current !== 'object') {
    return 'off'
  }
  return current.slack_reply_to_mode === 'first' || current.slack_reply_to_mode === 'all'
    ? current.slack_reply_to_mode
    : 'off'
}

export function normalizeHostedSlackAllowedUserIds(current: JsonObject | null): string[] {
  if (!current || typeof current !== 'object') return []
  const rawValue = current.slack_allowed_user_ids
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
}

export function normalizeHostedSlackWorkspaceWideEnabled(current: JsonObject | null): boolean {
  if (!current || typeof current !== 'object') return false
  return current.slack_workspace_wide_enabled === true
}

function getAssistantJoinValue(join: AssistantJoin): { name: string; description: string | null } {
  const value = Array.isArray(join) ? join[0] : join
  return {
    name: value?.name?.trim() || 'Untitled agent',
    description: value?.description?.trim() || null,
  }
}

function mapRow(row: SlackAssistantChannelRow): SlackHostedAssistantBinding {
  const assistant = getAssistantJoinValue(row.ai_assistants)
  const channelConfig =
    row.channel_config && typeof row.channel_config === 'object' ? row.channel_config : null
  const inboundRoutingConfig =
    row.inbound_routing_config && typeof row.inbound_routing_config === 'object'
      ? row.inbound_routing_config
      : null
  const rawSecrets = Array.isArray(row.encrypted_secrets)
    ? row.encrypted_secrets[0]
    : row.encrypted_secrets
  let botToken: string | null = null
  let teamId: string | null = null

  if (typeof rawSecrets?.encrypted_data === 'string' && rawSecrets.encrypted_data) {
    try {
      const decrypted = decryptChannelSecrets(rawSecrets.encrypted_data)
      botToken =
        typeof decrypted.bot_token === 'string' && decrypted.bot_token.trim().length > 0
          ? decrypted.bot_token.trim()
          : null
      teamId =
        typeof decrypted.team_id === 'string' && decrypted.team_id.trim().length > 0
          ? decrypted.team_id.trim()
          : null
    } catch {
      botToken = null
      teamId = null
    }
  }

  return {
    id: row.id,
    assistantId: row.assistant_id,
    assistantName: assistant.name,
    assistantDescription: assistant.description,
    externalChannelId: row.external_channel_id,
    isActive: row.is_active === true,
    isPrimary: row.is_primary === true,
    channelConfig,
    inboundRoutingConfig,
    createdAt: row.created_at,
    botToken,
    teamId:
      teamId ||
      (typeof channelConfig?.slack_team_id === 'string' ? channelConfig.slack_team_id : null),
    teamName:
      typeof channelConfig?.slack_team_name === 'string' ? channelConfig.slack_team_name : null,
  }
}

export function normalizeHostedSlackRoutingConfig(
  current: JsonObject | null,
): SlackHostedRoutingConfig {
  const source = current && typeof current === 'object' ? current : {}
  const prefixValue =
    typeof source.prefix === 'string' && source.prefix.trim().length > 0
      ? source.prefix.trim()
      : null

  return {
    dedicated_channel: source.dedicated_channel !== false,
    prefix: prefixValue,
    respond_on_mention: source.respond_on_mention !== false,
    thread_support: source.thread_support === true,
    ignore_bots: source.ignore_bots !== false,
  }
}

function buildHostedRoutingConfig(current: JsonObject | null): JsonObject {
  return normalizeHostedSlackRoutingConfig(current)
}

function buildBoundChannelConfig(
  current: JsonObject | null,
  teamId: string,
  boundVia: string,
  conversationMeta?: { label?: string | null; type?: string | null },
): JsonObject {
  return {
    ...(current && typeof current === 'object' ? current : {}),
    hosted: true,
    slack_team_id: teamId,
    install_status: 'bound',
    slack_workspace_wide_enabled: false,
    pending_bind: false,
    bound_via: boundVia,
    bound_at: new Date().toISOString(),
    ...(conversationMeta?.label ? { slack_conversation_label: conversationMeta.label } : {}),
    ...(conversationMeta?.type ? { slack_conversation_type: conversationMeta.type } : {}),
  }
}

function buildUnboundChannelConfig(current: JsonObject | null, teamId: string): JsonObject {
  return {
    ...(current && typeof current === 'object' ? current : {}),
    hosted: true,
    slack_team_id: teamId,
    install_status: 'installed_unbound',
    slack_workspace_wide_enabled: false,
    pending_bind: false,
    unbound_at: new Date().toISOString(),
  }
}

function isHostedSlackRow(row: SlackHostedAssistantBinding): boolean {
  return row.channelConfig?.hosted === true
}

function isHostedSlackInstalledUnbound(row: SlackHostedAssistantBinding): boolean {
  const installStatus =
    typeof row.channelConfig?.install_status === 'string'
      ? row.channelConfig.install_status.trim()
      : null
  return (
    row.externalChannelId == null &&
    row.isActive !== true &&
    (installStatus === 'installed_unbound' || installStatus === 'unbound')
  )
}

function isHostedSlackBoundConversation(row: SlackHostedAssistantBinding): boolean {
  return (
    row.isActive === true &&
    typeof row.externalChannelId === 'string' &&
    row.externalChannelId.trim().length > 0
  )
}

async function listHostedSlackRowsForAssistant(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<SlackHostedAssistantBinding[]> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('assistant_id', assistantId)
    .eq('channel_type', 'slack')
    .eq('connection_mode', 'hosted')
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return (data as unknown as SlackAssistantChannelRow[]).map(mapRow)
}

async function listHostedSlackRowsForTeam(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SlackHostedAssistantBinding[]> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('channel_type', 'slack')
    .eq('connection_mode', 'hosted')
    .contains('channel_config', {
      hosted: true,
      slack_team_id: teamId,
    })
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return (data as unknown as SlackAssistantChannelRow[]).map(mapRow)
}

function getPreferredHostedSlackInstallRow(
  rows: SlackHostedAssistantBinding[],
): SlackHostedAssistantBinding | null {
  return (
    rows.find(
      (row) =>
        isHostedSlackRow(row) &&
        row.externalChannelId == null,
    ) ??
    rows.find((row) => isHostedSlackRow(row) && isHostedSlackInstalledUnbound(row)) ??
    rows.find((row) => isHostedSlackRow(row)) ??
    null
  )
}

async function findHostedSlackBindingByConversation(params: {
  supabase: SupabaseClient
  teamId: string
  slackChannelId: string
}): Promise<SlackHostedAssistantBinding | null> {
  const { data, error } = await params.supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('channel_type', 'slack')
    .eq('connection_mode', 'hosted')
    .eq('external_channel_id', params.slackChannelId)
    .eq('is_active', true)
    .contains('channel_config', {
      hosted: true,
      slack_team_id: params.teamId,
    })
    .maybeSingle()

  if (error || !data) return null
  return mapRow(data as unknown as SlackAssistantChannelRow)
}

export async function getHostedSlackInstallForAssistant(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<SlackHostedAssistantBinding | null> {
  const rows = await listHostedSlackRowsForAssistant(supabase, assistantId)
  return getPreferredHostedSlackInstallRow(rows)
}

export async function listHostedSlackBindingsForAssistant(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<SlackHostedAssistantBinding[]> {
  const rows = await listHostedSlackRowsForAssistant(supabase, assistantId)
  return rows.filter((row) => isHostedSlackBoundConversation(row))
}

export async function listHostedSlackWorkspaceAgents(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SlackHostedWorkspaceAgentSummary[]> {
  const rows = await listHostedSlackRowsForTeam(supabase, teamId)
  if (rows.length === 0) return []

  const grouped = new Map<string, SlackHostedAssistantBinding[]>()
  for (const row of rows) {
    const existing = grouped.get(row.assistantId) ?? []
    existing.push(row)
    grouped.set(row.assistantId, existing)
  }

  const aliasRows = await listAssistantChannelAliases({
    channelType: 'slack',
    surfaceOwnerKind: 'team',
    surfaceOwnerId: teamId,
  })

  const aliasesByAssistantId = new Map<string, SlackHostedWorkspaceAgentAlias[]>()
  for (const row of aliasRows) {
    const current = aliasesByAssistantId.get(row.assistant_id) ?? []
    current.push({
      id: row.id,
      alias: row.alias,
    })
    aliasesByAssistantId.set(row.assistant_id, current)
  }

  return Array.from(grouped.entries())
    .map(([assistantId, assistantRows]) => {
      const install = getPreferredHostedSlackInstallRow(assistantRows)
      if (!install) return null
      return {
        assistantId,
        assistantName: install.assistantName,
        assistantDescription: install.assistantDescription,
        installChannelId: install.id,
        aliases: aliasesByAssistantId.get(assistantId) ?? [],
        boundConversationCount: assistantRows.filter((row) => isHostedSlackBoundConversation(row)).length,
        workspaceWideEnabled: normalizeHostedSlackWorkspaceWideEnabled(install.channelConfig),
      } satisfies SlackHostedWorkspaceAgentSummary
    })
    .filter((value): value is SlackHostedWorkspaceAgentSummary => Boolean(value))
    .sort((a, b) => a.assistantName.localeCompare(b.assistantName))
}

export async function listSlackHostedConversations(
  botToken: string,
): Promise<SlackHostedConversation[]> {
  const conversations: SlackHostedConversation[] = []
  let cursor: string | null = null
  const dmUserIds = new Set<string>()
  const dmChannelUserMap = new Map<string, string>()

  do {
    const params = new URLSearchParams({
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: 'true',
      limit: '200',
    })
    if (cursor) params.set('cursor', cursor)

    const response = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
      cache: 'no-store',
    })

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean
          error?: string
          channels?: Array<{
            id?: string
            name?: string
            is_private?: boolean
            is_mpim?: boolean
            is_im?: boolean
            is_channel?: boolean
            is_group?: boolean
            user?: string
          }>
          response_metadata?: { next_cursor?: string }
        }
      | null

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Slack conversations.list failed (${response.status})`)
    }

    for (const channel of payload.channels || []) {
      const id = typeof channel.id === 'string' ? channel.id : null
      if (!id) continue
      const isMpim = channel.is_mpim === true
      const isIm = channel.is_im === true
      const isPrivate = channel.is_private === true || channel.is_group === true
      const directMessageUserId =
        typeof channel.user === 'string' && channel.user.trim().length > 0
          ? channel.user.trim()
          : null
      if (isIm && directMessageUserId) {
        dmUserIds.add(directMessageUserId)
        dmChannelUserMap.set(id, directMessageUserId)
      }
      const rawName =
        typeof channel.name === 'string' && channel.name.trim().length > 0
          ? channel.name.trim()
          : isIm
            ? directMessageUserId
              ? `Direct message with @${directMessageUserId}`
              : 'Direct message'
            : isMpim
            ? 'Group DM'
            : id
      conversations.push({
        id,
        name: rawName,
        label: isIm
          ? `${rawName} (DM)`
          : isMpim
            ? `${rawName} (Group DM)`
            : `${isPrivate ? '# ' : '# '}${rawName}`,
        type: isIm ? 'im' : isMpim ? 'mpim' : isPrivate ? 'private' : 'public',
        isPrivate: isIm ? true : isPrivate,
      })
    }

    const nextCursor = payload.response_metadata?.next_cursor?.trim() || ''
    cursor = nextCursor || null
  } while (cursor)

  const dmUserLabels = new Map<string, string>()
  await Promise.all(
    Array.from(dmUserIds).map(async (userId) => {
      const response = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
        headers: {
          Authorization: `Bearer ${botToken}`,
        },
        cache: 'no-store',
      })
      const payload = (await response.json().catch(() => null)) as SlackUserProfile | null
      if (!response.ok || !payload?.ok || !payload.user) return
      const profile = payload.user.profile
      const label =
        (typeof profile?.display_name === 'string' && profile.display_name.trim().length > 0
          ? profile.display_name.trim()
          : null) ||
        (typeof payload.user.real_name === 'string' && payload.user.real_name.trim().length > 0
          ? payload.user.real_name.trim()
          : null) ||
        (typeof profile?.real_name === 'string' && profile.real_name.trim().length > 0
          ? profile.real_name.trim()
          : null) ||
        (typeof payload.user.name === 'string' && payload.user.name.trim().length > 0
          ? payload.user.name.trim()
          : null)
      if (label) {
        dmUserLabels.set(userId, label)
      }
    }),
  )

  for (const conversation of conversations) {
    if (conversation.type !== 'im') continue
    const userId = dmChannelUserMap.get(conversation.id)
    if (!userId) continue
    const label = dmUserLabels.get(userId)
    if (!label) continue
    conversation.name = `Direct message with ${label}`
    conversation.label = `${conversation.name} (DM)`
  }

  return conversations.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listSlackHostedUsers(
  botToken: string,
): Promise<SlackHostedUser[]> {
  const users: SlackHostedUser[] = []
  let cursor: string | null = null

  do {
    const params = new URLSearchParams({
      limit: '200',
    })
    if (cursor) params.set('cursor', cursor)

    const response = await fetch(`https://slack.com/api/users.list?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
      cache: 'no-store',
    })

    const payload = (await response.json().catch(() => null)) as SlackUsersListResponse | null

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Slack users.list failed (${response.status})`)
    }

    for (const member of payload.members || []) {
      const id = typeof member.id === 'string' ? member.id.trim() : ''
      if (!id || member.deleted === true || member.is_bot === true || member.is_app_user === true) {
        continue
      }
      const displayName =
        (typeof member.profile?.display_name === 'string' && member.profile.display_name.trim().length > 0
          ? member.profile.display_name.trim()
          : null) ||
        (typeof member.real_name === 'string' && member.real_name.trim().length > 0
          ? member.real_name.trim()
          : null) ||
        (typeof member.profile?.real_name === 'string' && member.profile.real_name.trim().length > 0
          ? member.profile.real_name.trim()
          : null) ||
        (typeof member.name === 'string' && member.name.trim().length > 0
          ? member.name.trim()
          : id)
      const username =
        typeof member.name === 'string' && member.name.trim().length > 0
          ? member.name.trim()
          : displayName

      users.push({
        id,
        name: username,
        displayName,
        avatarUrl:
          (typeof member.profile?.image_original === 'string' && member.profile.image_original.trim().length > 0
            ? member.profile.image_original.trim()
            : null) ||
          (typeof member.profile?.image_1024 === 'string' && member.profile.image_1024.trim().length > 0
            ? member.profile.image_1024.trim()
            : null) ||
          (typeof member.profile?.image_512 === 'string' && member.profile.image_512.trim().length > 0
            ? member.profile.image_512.trim()
            : null) ||
          (typeof member.profile?.image_192 === 'string' && member.profile.image_192.trim().length > 0
            ? member.profile.image_192.trim()
            : null) ||
          (typeof member.profile?.image_72 === 'string' && member.profile.image_72.trim().length > 0
            ? member.profile.image_72.trim()
            : null) ||
          (typeof member.profile?.image_48 === 'string' && member.profile.image_48.trim().length > 0
            ? member.profile.image_48.trim()
            : null) ||
          (typeof member.profile?.image_32 === 'string' && member.profile.image_32.trim().length > 0
            ? member.profile.image_32.trim()
            : null) ||
          (typeof member.profile?.image_24 === 'string' && member.profile.image_24.trim().length > 0
            ? member.profile.image_24.trim()
            : null),
      })
    }

    const nextCursor = payload.response_metadata?.next_cursor?.trim() || ''
    cursor = nextCursor || null
  } while (cursor)

  return users.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function bindHostedSlackAssistantToConversation(params: {
  supabase: SupabaseClient
  assistantId: string
  teamId: string
  slackChannelId: string
  conversationLabel?: string | null
  conversationType?: string | null
  boundVia?: 'web_bind' | 'modal_bind' | 'app_home' | 'slash_bind' | 'dm_bind'
}): Promise<SlackHostedAssistantBinding | null> {
  const rows = await listHostedSlackRowsForAssistant(params.supabase, params.assistantId)
  const install = getPreferredHostedSlackInstallRow(rows)
  if (!install || install.teamId !== params.teamId) return null

  const existingBinding = rows.find(
    (row) =>
      row.externalChannelId === params.slackChannelId &&
      row.isActive === true &&
      row.teamId === params.teamId,
  )
  if (existingBinding) {
    return existingBinding
  }

  const conflictingBinding = await findHostedSlackBindingByConversation({
    supabase: params.supabase,
    teamId: params.teamId,
    slackChannelId: params.slackChannelId,
  })
  if (conflictingBinding && conflictingBinding.assistantId !== params.assistantId) {
    return null
  }

  const { data: sourceRow, error: sourceError } = await params.supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('id', install.id)
    .maybeSingle()

  if (sourceError || !sourceRow) return null

  const source = sourceRow as unknown as SlackAssistantChannelRow
  const nextChannelConfig = buildBoundChannelConfig(
    install.channelConfig,
    params.teamId,
    params.boundVia || 'web_bind',
    {
      label: params.conversationLabel ?? null,
      type: params.conversationType ?? null,
    },
  )
  const nextRoutingConfig = buildHostedRoutingConfig(install.inboundRoutingConfig)

  const { data, error } = await params.supabase
    .from('assistant_channels')
    .insert({
      assistant_id: source.assistant_id,
      channel_type: 'slack',
      secret_token_hash:
        typeof source.secret_token_hash === 'string' && source.secret_token_hash.trim().length > 0
          ? source.secret_token_hash
          : crypto.randomUUID(),
      encrypted_secrets_id: source.encrypted_secrets_id ?? null,
      external_channel_id: params.slackChannelId,
      webhook_url: source.webhook_url ?? null,
      is_active: true,
      is_primary: false,
      channel_config: nextChannelConfig,
      connection_mode: 'hosted',
      inbound_routing_config: nextRoutingConfig,
    })
    .select(HOSTED_SLACK_SELECT)
    .single()

  if (error || !data) {
    throw error || new Error('Failed to create hosted Slack binding')
  }

  return mapRow(data as unknown as SlackAssistantChannelRow)
}

export async function unbindHostedSlackAssistantFromConversation(params: {
  supabase: SupabaseClient
  assistantChannelId: string
  teamId: string
}): Promise<SlackHostedAssistantBinding | null> {
  const { data: current, error: currentError } = await params.supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('id', params.assistantChannelId)
    .eq('channel_type', 'slack')
    .eq('connection_mode', 'hosted')
    .maybeSingle()

  if (currentError || !current) return null

  const row = mapRow(current as unknown as SlackAssistantChannelRow)
  if (row.teamId !== params.teamId) return null
  const siblingRows = await listHostedSlackRowsForAssistant(params.supabase, row.assistantId)
  const hasOtherHostedRow = siblingRows.some((candidate) => candidate.id !== row.id)

  if (hasOtherHostedRow) {
    const { error } = await params.supabase
      .from('assistant_channels')
      .delete()
      .eq('id', params.assistantChannelId)

    if (error) {
      throw error
    }

    return {
      ...row,
      externalChannelId: null,
      isActive: false,
      isPrimary: false,
    }
  }

  const nextChannelConfig = buildUnboundChannelConfig(row.channelConfig, params.teamId)
  const { error } = await params.supabase
    .from('assistant_channels')
    .update({
      external_channel_id: null,
      is_active: false,
      is_primary: false,
      channel_config: nextChannelConfig,
    })
    .eq('id', params.assistantChannelId)

  if (error) {
    throw error
  }

  return {
    ...row,
    externalChannelId: null,
    isActive: false,
    isPrimary: false,
    channelConfig: nextChannelConfig,
  }
}

export async function getHostedSlackActivitySnapshot(
  supabase: SupabaseClient,
  assistantChannelId: string,
): Promise<SlackHostedActivitySnapshot> {
  const [lastInboundResult, lastOutboundResult] = await Promise.all([
    supabase
      .from('assistant_inbound_events')
      .select('created_at, status')
      .eq('channel_id', assistantChannelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('assistant_outbound_events')
      .select('created_at, status, last_error')
      .eq('channel_id', assistantChannelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const inboundTimestamp =
    !lastInboundResult.error && typeof lastInboundResult.data?.created_at === 'string'
      ? Date.parse(lastInboundResult.data.created_at)
      : Number.NaN
  const outboundTimestamp =
    !lastOutboundResult.error && typeof lastOutboundResult.data?.created_at === 'string'
      ? Date.parse(lastOutboundResult.data.created_at)
      : Number.NaN

  return {
    lastInboundAt:
      !lastInboundResult.error && typeof lastInboundResult.data?.created_at === 'string'
        ? lastInboundResult.data.created_at
        : null,
    lastInboundStatus:
      !lastInboundResult.error && typeof lastInboundResult.data?.status === 'string'
        ? lastInboundResult.data.status
        : null,
    lastOutboundAt:
      !lastOutboundResult.error && typeof lastOutboundResult.data?.created_at === 'string'
        ? lastOutboundResult.data.created_at
        : null,
    lastOutboundStatus:
      !lastOutboundResult.error && typeof lastOutboundResult.data?.status === 'string'
        ? lastOutboundResult.data.status
        : null,
    lastOutboundError:
      !lastOutboundResult.error && typeof lastOutboundResult.data?.last_error === 'string'
        ? lastOutboundResult.data.last_error
        : null,
    lastReplyLatencyMs:
      Number.isFinite(inboundTimestamp) &&
      Number.isFinite(outboundTimestamp) &&
      outboundTimestamp >= inboundTimestamp
        ? outboundTimestamp - inboundTimestamp
        : null,
  }
}

export async function updateHostedSlackRoutingConfig(params: {
  supabase: SupabaseClient
  assistantChannelId: string
  teamId: string
  inboundRoutingConfig: Partial<SlackHostedRoutingConfig>
  typingReaction?: string | null
  ackReaction?: string | null
  streamingPreview?: boolean
  streamingMode?: SlackHostedStreamingMode
  nativeStreaming?: boolean
  allowedUserIds?: string[]
  threadHistoryScope?: SlackHostedThreadHistoryScope
  threadInheritParent?: boolean
  threadInitialHistoryLimit?: number | null
  replyToMode?: SlackHostedReplyToMode
  workspaceWideEnabled?: boolean
}): Promise<SlackHostedAssistantBinding | null> {
  const { data: current, error: currentError } = await params.supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('id', params.assistantChannelId)
    .eq('channel_type', 'slack')
    .eq('connection_mode', 'hosted')
    .maybeSingle()

  if (currentError || !current) return null

  const row = mapRow(current as unknown as SlackAssistantChannelRow)
  if (row.teamId !== params.teamId) return null

  const nextRoutingConfig = normalizeHostedSlackRoutingConfig({
    ...(row.inboundRoutingConfig && typeof row.inboundRoutingConfig === 'object'
      ? row.inboundRoutingConfig
      : {}),
    ...params.inboundRoutingConfig,
  })
  const nextChannelConfig =
    row.channelConfig && typeof row.channelConfig === 'object'
      ? { ...row.channelConfig }
      : {}
  if (params.typingReaction !== undefined) {
    nextChannelConfig.slack_typing_reaction = params.typingReaction
  }
  if (params.ackReaction !== undefined) {
    nextChannelConfig.slack_ack_reaction = params.ackReaction
  }
  if (params.streamingPreview !== undefined) {
    nextChannelConfig.slack_streaming_preview = params.streamingPreview
  }
  if (params.streamingMode !== undefined) {
    nextChannelConfig.slack_streaming_mode = params.streamingMode
    nextChannelConfig.slack_streaming_preview = params.streamingMode !== 'off'
  }
  if (params.nativeStreaming !== undefined) {
    nextChannelConfig.slack_native_streaming = params.nativeStreaming
  }
  if (params.allowedUserIds !== undefined) {
    nextChannelConfig.slack_allowed_user_ids = params.allowedUserIds
  }
  if (params.threadHistoryScope !== undefined) {
    nextChannelConfig.slack_thread_history_scope = params.threadHistoryScope
  }
  if (params.threadInheritParent !== undefined) {
    nextChannelConfig.slack_thread_inherit_parent = params.threadInheritParent
  }
  if (params.threadInitialHistoryLimit !== undefined) {
    nextChannelConfig.slack_thread_initial_history_limit = params.threadInitialHistoryLimit
  }
  if (params.replyToMode !== undefined) {
    nextChannelConfig.slack_reply_to_mode = params.replyToMode
  }
  if (params.workspaceWideEnabled !== undefined) {
    nextChannelConfig.slack_workspace_wide_enabled = params.workspaceWideEnabled
    if (row.externalChannelId == null) {
      nextChannelConfig.install_status = params.workspaceWideEnabled ? 'workspace_wide' : 'installed_unbound'
    }
  }

  const { error } = await params.supabase
    .from('assistant_channels')
    .update({
      inbound_routing_config: nextRoutingConfig,
      channel_config: nextChannelConfig,
      ...(row.externalChannelId == null && params.workspaceWideEnabled !== undefined
        ? { is_active: params.workspaceWideEnabled }
        : {}),
    })
    .eq('id', params.assistantChannelId)

  if (error) {
    throw error
  }

  return {
    ...row,
    isActive:
      row.externalChannelId == null && params.workspaceWideEnabled !== undefined
        ? params.workspaceWideEnabled
        : row.isActive,
    channelConfig: nextChannelConfig,
    inboundRoutingConfig: nextRoutingConfig,
  }
}
