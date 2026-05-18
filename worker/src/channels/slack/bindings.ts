import type { SupabaseClient } from '@supabase/supabase-js'

type JsonObject = Record<string, unknown>

type AssistantJoin =
  | { name?: string | null; description?: string | null; org_id?: string | null }
  | Array<{ name?: string | null; description?: string | null; org_id?: string | null }>
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
  ai_assistants: AssistantJoin
}

const HOSTED_SLACK_SELECT =
  'id, assistant_id, secret_token_hash, encrypted_secrets_id, external_channel_id, webhook_url, is_active, is_primary, channel_config, inbound_routing_config, created_at, ai_assistants(name, description, org_id)'

export interface SlackHostedAssistantBinding {
  id: string
  assistantId: string
  orgId: string | null
  assistantName: string
  assistantDescription: string | null
  aliases?: string[]
  externalChannelId: string | null
  isActive: boolean
  isPrimary: boolean
  channelConfig: JsonObject | null
  inboundRoutingConfig: JsonObject | null
  createdAt: string | null
}

interface SlackConversationMeta {
  label?: string | null
  type?: 'public' | 'private' | 'mpim' | 'im' | null
}

export interface SlackBindResult {
  ok: boolean
  reason?:
    | 'not_found'
    | 'wrong_team'
    | 'target_conflict'
    | 'update_failed'
  binding?: SlackHostedAssistantBinding
  previousExternalChannelId?: string | null
  replacedBinding?: SlackHostedAssistantBinding | null
}

export interface SlackHostedActivitySnapshot {
  lastInboundAt: string | null
  lastInboundStatus: string | null
  lastOutboundAt: string | null
  lastOutboundStatus: string | null
  lastOutboundError: string | null
  lastReplyLatencyMs: number | null
}

function getAssistantJoinValue(join: AssistantJoin): {
  name: string
  description: string | null
  orgId: string | null
} {
  const value = Array.isArray(join) ? join[0] : join
  return {
    name: value?.name?.trim() || 'Untitled agent',
    description: value?.description?.trim() || null,
    orgId: typeof value?.org_id === 'string' ? value.org_id : null,
  }
}

function mapRow(row: SlackAssistantChannelRow): SlackHostedAssistantBinding {
  const assistant = getAssistantJoinValue(row.ai_assistants)
  return {
    id: row.id,
    assistantId: row.assistant_id,
    orgId: assistant.orgId,
    assistantName: assistant.name,
    assistantDescription: assistant.description,
    externalChannelId: row.external_channel_id,
    isActive: row.is_active === true,
    isPrimary: row.is_primary === true,
    channelConfig:
      row.channel_config && typeof row.channel_config === 'object'
        ? row.channel_config
        : null,
    inboundRoutingConfig:
      row.inbound_routing_config && typeof row.inbound_routing_config === 'object'
        ? row.inbound_routing_config
        : null,
    createdAt: row.created_at,
  }
}

function isHostedSlackRowForTeam(
  row: SlackHostedAssistantBinding,
  teamId: string,
): boolean {
  const config = row.channelConfig || {}
  return config.hosted === true && config.slack_team_id === teamId
}

function isInstalledUnbound(row: SlackHostedAssistantBinding): boolean {
  const config = row.channelConfig || {}
  const installStatus =
    typeof config.install_status === 'string' ? config.install_status : null
  return (
    row.externalChannelId == null &&
    row.isActive !== true &&
    (installStatus === 'installed_unbound' ||
      installStatus === 'unbound' ||
      config.pending_bind === true ||
      config.hosted === true)
  )
}

function isWorkspaceWideEnabled(row: SlackHostedAssistantBinding): boolean {
  const config = row.channelConfig || {}
  return config.slack_workspace_wide_enabled === true
}

function buildBoundChannelConfig(
  current: JsonObject | null,
  teamId: string,
  boundVia: string,
  conversationMeta?: SlackConversationMeta,
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

function buildUnboundChannelConfig(
  current: JsonObject | null,
  teamId: string,
): JsonObject {
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

function buildHostedRoutingConfig(current: JsonObject | null): JsonObject {
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

async function listHostedSlackRowsForTeam(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SlackHostedAssistantBinding[]> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('channel_type', 'slack')
    .contains('channel_config', {
      hosted: true,
      slack_team_id: teamId,
    })
    .order('created_at', { ascending: false })

  if (error || !data) {
    if (error) {
      console.error(
        `[slack-bind] Failed to list hosted Slack rows for team ${teamId}:`,
        error,
      )
    }
    return []
  }

  const rows = (data as SlackAssistantChannelRow[]).map(mapRow)
  const assistantIds = rows.map((row) => row.assistantId)
  if (assistantIds.length === 0) {
    return rows
  }

  const { data: aliasesData, error: aliasesError } = await supabase
    .from('assistant_channel_aliases')
    .select('assistant_id, alias')
    .eq('channel_type', 'slack')
    .eq('surface_owner_kind', 'team')
    .eq('surface_owner_id', teamId)
    .eq('is_active', true)
    .in('assistant_id', assistantIds)
    .order('alias', { ascending: true })

  if (aliasesError || !aliasesData) {
    if (aliasesError) {
      console.error(
        `[slack-bind] Failed to load aliases for team ${teamId}:`,
        aliasesError,
      )
    }
    return rows
  }

  const aliasesByAssistantId = new Map<string, string[]>()
  for (const row of aliasesData as Array<{ assistant_id: string; alias: string }>) {
    const alias = row.alias.trim()
    if (alias.length === 0) continue
    const aliases = aliasesByAssistantId.get(row.assistant_id) ?? []
    if (!aliases.includes(alias)) {
      aliases.push(alias)
    }
    aliasesByAssistantId.set(row.assistant_id, aliases)
  }

  return rows.map((row) => ({
    ...row,
    aliases: aliasesByAssistantId.get(row.assistantId) ?? [],
  }))
}

export async function listUnboundHostedSlackInstalls(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SlackHostedAssistantBinding[]> {
  const rows = await listHostedSlackRowsForTeam(supabase, teamId)
  const byAssistant = new Map<string, SlackHostedAssistantBinding>()
  for (const row of rows) {
    if (!isHostedSlackRowForTeam(row, teamId)) continue
    const current = byAssistant.get(row.assistantId)
    if (!current) {
      byAssistant.set(row.assistantId, row)
      continue
    }
    if (isWorkspaceWideEnabled(current) && !isWorkspaceWideEnabled(row)) {
      continue
    }
    if (isWorkspaceWideEnabled(row) && !isWorkspaceWideEnabled(current)) {
      byAssistant.set(row.assistantId, row)
      continue
    }
    if (isInstalledUnbound(row) && !isInstalledUnbound(current)) {
      byAssistant.set(row.assistantId, row)
    }
  }
  return Array.from(byAssistant.values())
}

export async function listBoundHostedSlackBindings(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SlackHostedAssistantBinding[]> {
  const rows = await listHostedSlackRowsForTeam(supabase, teamId)
  return rows.filter(
    (row) =>
      isHostedSlackRowForTeam(row, teamId) &&
      row.isActive === true &&
      typeof row.externalChannelId === 'string' &&
      row.externalChannelId.length > 0,
  )
}

export async function getHostedSlackBindingForConversation(
  supabase: SupabaseClient,
  params: {
    teamId: string
    slackChannelId: string
  },
): Promise<SlackHostedAssistantBinding | null> {
  const rows = await listBoundHostedSlackBindings(supabase, params.teamId)
  return rows.find((row) => row.externalChannelId === params.slackChannelId) || null
}

export async function getHostedSlackInstallById(
  supabase: SupabaseClient,
  params: {
    teamId: string
    assistantChannelId: string
  },
): Promise<SlackHostedAssistantBinding | null> {
  const rows = await listHostedSlackRowsForTeam(supabase, params.teamId)
  return rows.find((row) => row.id === params.assistantChannelId) || null
}

export async function bindHostedSlackInstallToConversation(
  supabase: SupabaseClient,
  params: {
    teamId: string
    assistantChannelId: string
    slackChannelId: string
    boundVia: 'slash_bind' | 'dm_bind' | 'app_home' | 'modal_bind'
    conversationLabel?: string | null
    conversationType?: 'public' | 'private' | 'mpim' | 'im' | null
  },
): Promise<SlackBindResult> {
  const target = await getHostedSlackInstallById(supabase, {
    teamId: params.teamId,
    assistantChannelId: params.assistantChannelId,
  })
  if (!target) {
    return { ok: false, reason: 'not_found' }
  }
  if (!isHostedSlackRowForTeam(target, params.teamId)) {
    return { ok: false, reason: 'wrong_team' }
  }

  const replacedBinding = await getHostedSlackBindingForConversation(supabase, {
    teamId: params.teamId,
    slackChannelId: params.slackChannelId,
  })
  if (replacedBinding && replacedBinding.id !== target.id) {
    return {
      ok: false,
      reason: 'target_conflict',
      replacedBinding,
    }
  }

  const previousExternalChannelId = target.externalChannelId
  const nextChannelConfig = buildBoundChannelConfig(
    target.channelConfig,
    params.teamId,
    params.boundVia,
    {
      label: params.conversationLabel,
      type: params.conversationType,
    },
  )
  const nextRoutingConfig = buildHostedRoutingConfig(target.inboundRoutingConfig)

  const { data, error } = await supabase
    .from('assistant_channels')
    .select(HOSTED_SLACK_SELECT)
    .eq('id', target.id)
    .single()

  if (error || !data) {
    if (error) {
      console.error(`[slack-bind] Failed to load hosted Slack source row ${target.id}:`, error)
    }
    return { ok: false, reason: 'update_failed' }
  }

  const source = data as SlackAssistantChannelRow
  const { data: inserted, error: insertError } = await supabase
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

  if (insertError || !inserted) {
    if (insertError) {
      console.error(
        `[slack-bind] Failed to create hosted Slack binding from ${target.id}:`,
        insertError,
      )
    }
    return { ok: false, reason: 'update_failed' }
  }

  return {
    ok: true,
    binding: mapRow(inserted as SlackAssistantChannelRow),
    previousExternalChannelId,
  }
}

export async function unbindHostedSlackConversation(
  supabase: SupabaseClient,
  params: {
    teamId: string
    slackChannelId: string
  },
): Promise<SlackHostedAssistantBinding | null> {
  const current = await getHostedSlackBindingForConversation(supabase, params)
  if (!current) return null

  const siblingRows = await listHostedSlackRowsForTeam(supabase, params.teamId)
  const hasOtherHostedRowForAssistant = siblingRows.some(
    (row) => row.assistantId === current.assistantId && row.id !== current.id,
  )

  if (hasOtherHostedRowForAssistant) {
    const { error } = await supabase.from('assistant_channels').delete().eq('id', current.id)
    if (error) {
      console.error(
        `[slack-bind] Failed to delete Slack conversation ${params.slackChannelId}:`,
        error,
      )
      return null
    }
    return {
      ...current,
      externalChannelId: null,
      isActive: false,
      isPrimary: false,
    }
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({
      external_channel_id: null,
      is_active: false,
      is_primary: false,
      channel_config: buildUnboundChannelConfig(current.channelConfig, params.teamId),
    })
    .eq('id', current.id)
    .select(HOSTED_SLACK_SELECT)
    .single()

  if (error || !data) {
    if (error) {
      console.error(
        `[slack-bind] Failed to unbind Slack conversation ${params.slackChannelId}:`,
        error,
      )
    }
    return null
  }

  return mapRow(data as SlackAssistantChannelRow)
}

export async function unbindHostedSlackInstallById(
  supabase: SupabaseClient,
  params: {
    teamId: string
    assistantChannelId: string
  },
): Promise<SlackHostedAssistantBinding | null> {
  const current = await getHostedSlackInstallById(supabase, params)
  if (!current) return null

  if (
    current.externalChannelId &&
    current.externalChannelId.trim().length > 0 &&
    current.isActive === true
  ) {
    return unbindHostedSlackConversation(supabase, {
      teamId: params.teamId,
      slackChannelId: current.externalChannelId,
    })
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({
      external_channel_id: null,
      is_active: false,
      is_primary: false,
      channel_config: buildUnboundChannelConfig(current.channelConfig, params.teamId),
    })
    .eq('id', current.id)
    .select(HOSTED_SLACK_SELECT)
    .single()

  if (error || !data) {
    if (error) {
      console.error(
        `[slack-bind] Failed to unbind hosted Slack install ${current.id}:`,
        error,
      )
    }
    return null
  }

  return mapRow(data as SlackAssistantChannelRow)
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
