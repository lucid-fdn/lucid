import {
  getAssistant,
  getDiscordStatusForGuild,
  getDiscordVoiceSettingsForGuild,
  getPrimaryDiscordChannelForGuild,
  listDiscordChannelsForGuild,
  setPrimaryDiscordChannel,
  unbindDiscordChannel,
  updateDiscordVoiceSettingsForGuild,
  updateAssistant,
} from '@/lib/db'
import { discordWorkerFetch } from './worker-admin'
import {
  findMatchingModels,
  loadModelChoices,
  summarizeModelChoices,
  type ModelChoice,
} from '@/lib/ai/model-choices'
import {
  MESSAGE_FLAGS,
  hasGuildAdminPerms,
} from './hosted-router'
import { resolveAgentTarget } from '@/lib/channels/agent-target-resolver'
import {
  buildAgentOpsChannelCommandUsage,
  parseChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { runChannelNativeActionChunks } from '@/lib/db/channel-native-actions'
import { SHARED_VOICE_IDS, normalizeSharedVoiceId } from '@/lib/media/voice-options'
import {
  agentsComponents,
  leaveConfirmComponents,
  type DiscordActionRow,
  type GuildBinding,
  modelsComponents,
  type GuildModelChoice,
} from './inline-keyboards'

export interface DiscordReply {
  content: string
  components?: DiscordActionRow[]
  flags?: number
  followupMessages?: string[]
}

const ONBOARDING_TEXT =
  'No agent is connected to this server yet.\n\n' +
  'An admin can install one from **Lucid Studio -> Agents -> your agent -> Channels -> Install on Discord**.'

const HELP_TEXT =
  '**Hosted Lucid Bot - commands**\n' +
  '`/agents` - list agents installed in this server, pick the active one\n' +
  '`/switch <name>` - change the active agent by name\n' +
  '`/whoami` - show the currently active agent\n' +
  '`/status` - show routing, delivery, voice, and model details for the active agent\n' +
  '`/ops workflow:<workflow> target:<url|pr|branch>` - launch Agent Ops from this server\n' +
  '`/ops workflow:buy target:<request>` - prepare a governed purchase with approval gates\n' +
  '`/ops workflow:plan target:<goal>` - start plan-only Agent Ops\n' +
  '`/ops workflow:search target:<query>` - search Mission Control\n' +
  '`/ops workflow:remember target:<fact>` - save a Knowledge claim\n' +
  '`/ops workflow:claims target:<query>` - list active Knowledge claims\n' +
  '`/probe` - run a live hosted bot health probe\n' +
  '`/voice` - inspect Discord voice reply settings for the active agent\n' +
  '`/voice mode:<off|auto|always> name:<voice>` - update Discord voice replies (admin only)\n' +
  '`/vc action:<join|leave|status> channel:<voice-channel>` - manage hosted Discord voice sessions (admin only)\n' +
  '`/models` - inspect the active agent model and suggested alternatives\n' +
  '`/model <name>` - set the active agent model (admin only)\n' +
  '`/leave` - unbind the active agent (admin only)'

const EPHEMERAL: DiscordReply['flags'] = MESSAGE_FLAGS.EPHEMERAL

function replyEphemeral(
  content: string,
  components?: DiscordActionRow[],
  followupMessages?: string[],
): DiscordReply {
  return { content, components, flags: EPHEMERAL, followupMessages }
}

function mapGuildModelChoices(
  models: ReadonlyArray<ModelChoice>,
  currentModelId: string,
): GuildModelChoice[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    is_current: model.id === currentModelId,
  }))
}

function normalizeVoiceMode(
  rawMode: string | null | undefined,
): 'off' | 'auto' | 'always' | null {
  const normalized = rawMode?.trim().toLowerCase()
  return normalized === 'off' || normalized === 'auto' || normalized === 'always'
    ? normalized
    : null
}

function normalizeVoiceId(rawVoice: string | null | undefined): string | null {
  return normalizeSharedVoiceId(rawVoice)
}

export async function handleAgentsCommand(
  guildId: string | null,
  userId: string | null = null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  const bindings = await listDiscordChannelsForGuild(guildId)
  if (bindings.length === 0) {
    return replyEphemeral(ONBOARDING_TEXT)
  }

  return replyEphemeral(
    'Agents installed in this server - choose the one that should answer messages:',
    userId ? agentsComponents(bindings, { guildId, userId }) : undefined,
  )
}

export async function handleSwitchCommand(
  guildId: string | null,
  rawArg: string,
  userId: string | null = null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  const name = rawArg.trim().toLowerCase()
  if (!name) {
    return replyEphemeral(
      'Usage: `/switch name:<agent>`. Run `/agents` to see what is installed in this server.',
    )
  }

  const bindings = await listDiscordChannelsForGuild(guildId)
  if (bindings.length === 0) {
    return replyEphemeral(ONBOARDING_TEXT)
  }

  const resolution = resolveAgentTarget({
    bindings,
    explicitTarget: name,
  })
  if (resolution.kind === 'unresolved') {
    return replyEphemeral(`No agent matching "${rawArg}" is installed here. Try \`/agents\`.`)
  }

  if (resolution.kind === 'ambiguous') {
    return replyEphemeral(
      `Multiple agents match "${rawArg}". Pick the one you want:`,
      userId ? agentsComponents(resolution.bindings, { guildId, userId }) : undefined,
    )
  }

  const target = resolution.binding
  if (target.is_primary) {
    return replyEphemeral(`**${target.assistant_name}** is already active in this server.`)
  }

  const result = await setPrimaryDiscordChannel(guildId, target.assistant_id, false)
  if (!result.ok) {
    return replyEphemeral(
      `Could not switch to **${target.assistant_name}**. The agent may have been removed.`,
    )
  }

  return replyEphemeral(`Switched to **${target.assistant_name}**.`)
}

export async function handleWhoamiCommand(
  guildId: string | null,
  userId: string | null = null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (!primary) {
    const bindings = await listDiscordChannelsForGuild(guildId)
    if (bindings.length === 0) {
      return replyEphemeral(ONBOARDING_TEXT)
    }
    return replyEphemeral(
      'No active agent in this server. Pick one:',
      userId ? agentsComponents(bindings, { guildId, userId }) : undefined,
    )
  }

  const bindings = await listDiscordChannelsForGuild(guildId)
  const active = bindings.find((b) => b.assistant_id === primary.assistant_id)
  if (!active) {
    return replyEphemeral('Currently chatting with the active agent.')
  }

  const rawDesc = active.assistant_description?.trim() ?? ''
  const firstLine = rawDesc.split('\n', 1)[0] ?? ''
  const desc = firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine
  const otherAgentsCount = bindings.filter((binding) => binding.assistant_id !== active.assistant_id).length
  const switchHint =
    otherAgentsCount > 0
      ? `\n${otherAgentsCount} more agent${otherAgentsCount === 1 ? '' : 's'} can be switched in with \`/switch name:<agent>\`.`
      : '\nNo other agents are linked to this server yet.'

  return replyEphemeral(
    desc
      ? `Currently chatting with **${active.assistant_name}**\n${desc}${switchHint}`
      : `Currently chatting with **${active.assistant_name}**${switchHint}`,
  )
}

function formatReplyMode(mode: 'off' | 'first' | 'all'): string {
  switch (mode) {
    case 'off':
      return 'No reply reference'
    case 'all':
      return 'Reply on every chunk'
    default:
      return 'Reply on first chunk only'
  }
}

function formatChunkMode(mode: 'length' | 'newline'): string {
  return mode === 'newline' ? 'newline-aware' : 'balanced length'
}

export async function handleStatusCommand(
  guildId: string | null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  const status = await getDiscordStatusForGuild(guildId)
  if (!status) {
    const bindings = await listDiscordChannelsForGuild(guildId)
    if (bindings.length === 0) {
      return replyEphemeral(ONBOARDING_TEXT)
    }
    return replyEphemeral(TEXTS.noPrimaryHasBindings)
  }

  const bindings = await listDiscordChannelsForGuild(guildId)
  const otherAgentsCount = bindings.filter((binding) => binding.assistant_id !== status.assistantId).length
  const routingSummary =
    status.dedicatedChannelIds.length > 0
      ? `${status.dedicatedChannelIds.length} dedicated channel${status.dedicatedChannelIds.length === 1 ? '' : 's'} always reply; everywhere else stays mention-only`
      : 'Mention-only across the server'

  return replyEphemeral(
    [
      `**${status.assistantName}** Discord status`,
      status.assistantDescription ? status.assistantDescription.split('\n', 1)[0] ?? '' : null,
      '',
      `Model: \`${status.model ?? 'unknown'}\``,
      `Routing: ${routingSummary}`,
      `Delivery: ${formatReplyMode(status.replyToMode)} • ${formatChunkMode(status.chunkMode)} • soft cap \`${status.maxLinesPerMessage}\` lines per message`,
      `Voice replies: \`${status.voiceMode}\`${status.voiceId ? ` • \`${status.voiceId}\`` : ''}`,
      `Server: ${status.guildName ?? guildId}`,
      otherAgentsCount > 0
        ? `${otherAgentsCount} more installed agent${otherAgentsCount === 1 ? '' : 's'} can be switched in with \`/switch name:<agent>\`.`
        : 'No other agents are linked to this server yet.',
    ].filter((line) => line !== null).join('\n'),
  )
}

export async function handleProbeCommand(
  guildId: string | null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  const bindings = await listDiscordChannelsForGuild(guildId)
  if (bindings.length === 0) {
    return replyEphemeral(ONBOARDING_TEXT)
  }

  try {
    const probe = await discordWorkerFetch('/discord/probe', { method: 'POST' }) as {
      configured?: boolean
      running?: boolean
      lastStartAt?: string | null
      lastProbeAt?: string | null
      lastError?: string | null
      presence?: {
        status?: string | null
        activity?: { name?: string | null; state?: string | null } | null
      } | null
      probe?: {
        ok?: boolean
        status?: number | null
        error?: string | null
        elapsedMs?: number | null
        bot?: { username?: string | null; id?: string | null } | null
      } | null
    }

    const presenceText =
      probe.presence?.activity?.state ||
      probe.presence?.activity?.name ||
      probe.presence?.status ||
      'unknown'

    return replyEphemeral(
      [
        '**Hosted Discord bot probe**',
        `Configured: ${probe.configured ? 'Yes' : 'No'}`,
        `Running: ${probe.running ? 'Yes' : 'No'}`,
        `Presence: \`${probe.presence?.status ?? 'unknown'}\` • ${presenceText}`,
        probe.probe
          ? `Probe: ${probe.probe.ok ? 'ok' : 'failed'} • HTTP ${probe.probe.status ?? 'n/a'} • ${probe.probe.elapsedMs ?? 0}ms`
          : 'Probe: unavailable',
        probe.probe?.bot?.username ? `Bot: ${probe.probe.bot.username}` : null,
        probe.lastError ? `Last error: ${probe.lastError}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
    )
  } catch (error) {
    return replyEphemeral(
      `Discord probe failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function handleAgentOpsCommand(params: {
  guildId: string | null
  workflow: string
  target?: string | null
  userId?: string | null
}): Promise<DiscordReply> {
  if (!params.guildId) return replyEphemeral(TEXTS.guildOnly)

  const rawCommandArg = [params.workflow, params.target ?? ''].filter(Boolean).join(' ')
  const command = parseChannelNativeCommand(rawCommandArg)
  if (!command) {
    return replyEphemeral(buildAgentOpsChannelCommandUsage('Discord'))
  }

  const primary = await getPrimaryDiscordChannelForGuild(params.guildId)
  const bindings = await listDiscordChannelsForGuild(params.guildId)
  const active = primary
    ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
    : bindings.find((binding) => binding.is_primary)

  if (!active) {
    if (bindings.length === 0) return replyEphemeral(ONBOARDING_TEXT)
    return replyEphemeral(
      'No active agent in this server. Pick one before launching Agent Ops.',
      params.userId ? agentsComponents(bindings, { guildId: params.guildId, userId: params.userId }) : undefined,
    )
  }

  const chunks = await runChannelNativeActionChunks({
    channelType: 'discord',
    channelLabel: 'Discord',
    surfaceId: params.guildId,
    externalUserId: params.userId,
    rawCommandArg,
    binding: active,
  })

  return replyEphemeral(chunks[0] ?? 'Discord Agent Ops run started.', undefined, chunks.slice(1))
}

export async function handleVoiceCommand(params: {
  guildId: string | null
  memberPermissions: string | null
  rawMode?: string | null
  rawVoice?: string | null
}): Promise<DiscordReply> {
  if (!params.guildId) return replyEphemeral(TEXTS.guildOnly)

  const settings = await getDiscordVoiceSettingsForGuild(params.guildId)
  if (!settings) {
    return replyEphemeral(TEXTS.noPrimaryHasBindings)
  }

  const wantsMutation = params.rawMode != null || params.rawVoice != null
  if (!wantsMutation) {
    return replyEphemeral(
      [
        `**${settings.assistantName}** Discord voice replies`,
        `Mode: \`${settings.mode}\``,
        `Voice: \`${settings.voiceId ?? 'default'}\``,
        '',
        'Use `/voice mode:<off|auto|always> name:<voice>` to update the active agent.',
        `Available voices: ${SHARED_VOICE_IDS.join(', ')}`,
      ].join('\n'),
    )
  }

  if (!hasGuildAdminPerms(params.memberPermissions)) {
    return replyEphemeral('Only server administrators can change Discord voice reply settings.')
  }

  const requestedMode = normalizeVoiceMode(params.rawMode)
  const requestedVoice = normalizeVoiceId(params.rawVoice)

  if (params.rawMode != null && !requestedMode) {
    return replyEphemeral('Unsupported voice mode. Use `off`, `auto`, or `always`.')
  }
  if (params.rawVoice != null && !requestedVoice) {
    return replyEphemeral(`Unsupported voice. Available voices: ${SHARED_VOICE_IDS.join(', ')}`)
  }

  const updated = await updateDiscordVoiceSettingsForGuild({
    guildId: params.guildId,
    assistantId: settings.assistantId,
    ...(requestedMode ? { mode: requestedMode } : {}),
    ...(params.rawVoice != null ? { voiceId: requestedVoice } : {}),
  })

  if (!updated) {
    return replyEphemeral(TEXTS.bindFailed)
  }

  return replyEphemeral(
    [
      `Updated **${updated.assistantName}** Discord voice replies.`,
      `Mode: \`${updated.mode}\``,
      `Voice: \`${updated.voiceId ?? 'default'}\``,
    ].join('\n'),
  )
}

export async function handleVoiceChannelCommand(params: {
  guildId: string | null
  memberPermissions: string | null
  rawAction?: string | null
  rawChannelId?: string | null
}): Promise<DiscordReply> {
  if (!params.guildId) return replyEphemeral(TEXTS.guildOnly)

  const bindings = await listDiscordChannelsForGuild(params.guildId)
  if (bindings.length === 0) {
    return replyEphemeral(ONBOARDING_TEXT)
  }

  const action = (params.rawAction ?? 'status').trim().toLowerCase()
  if (!['join', 'leave', 'status'].includes(action)) {
    return replyEphemeral('Unsupported voice session action. Use `join`, `leave`, or `status`.')
  }

  if (action !== 'status' && !hasGuildAdminPerms(params.memberPermissions)) {
    return replyEphemeral('Only server administrators can manage hosted Discord voice sessions.')
  }

  if (action === 'join' && !params.rawChannelId) {
    return replyEphemeral('Choose a voice channel with `/vc action:join channel:<voice-channel>`.')
  }

  try {
    const response = await discordWorkerFetch('/discord/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        guildId: params.guildId,
        channelId: params.rawChannelId ?? undefined,
      }),
    }) as {
      ok?: boolean
      message?: string
      sessions?: Array<{
        guildId: string
        channelId: string
        assistantId: string
        connected: boolean
      }>
    }

    if (action === 'status') {
      const session = (response.sessions ?? []).find((entry) => entry.guildId === params.guildId)
      return replyEphemeral(
        session
          ? [
              '**Hosted Discord voice session**',
              `Status: \`${session.connected ? 'connected' : 'connecting'}\``,
              `Voice channel: \`${session.channelId}\``,
              `Assistant: \`${session.assistantId}\``,
            ].join('\n')
          : 'No hosted Discord voice session is active in this server.',
      )
    }

    return replyEphemeral(response.message ?? (response.ok ? 'Voice session updated.' : 'Voice session update failed.'))
  } catch (error) {
    return replyEphemeral(
      `Hosted Discord voice command failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function handleModelsCommand(
  guildId: string | null,
  memberPermissions: string | null = null,
  userId: string | null = null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (!primary) {
    return replyEphemeral(TEXTS.noPrimaryHasBindings)
  }

  const assistant = await getAssistant(primary.assistant_id)
  if (!assistant) {
    return replyEphemeral(TEXTS.agentNotFound)
  }

  const models = await loadModelChoices()
  const suggestions = summarizeModelChoices(models)
  const canManageModels = hasGuildAdminPerms(memberPermissions)
  const components = canManageModels && userId
    ? modelsComponents(mapGuildModelChoices(models, assistant.lucid_model), { guildId, userId })
    : undefined

  return replyEphemeral(
    [
      `Active agent: **${assistant.name}**`,
      `Current model: \`${assistant.lucid_model}\``,
      '',
      'Suggested models:',
      suggestions || '- No models available right now',
      '',
      'Use `/model name:<model>` to switch.',
    ].join('\n'),
    components,
  )
}

export async function handleModelCommand(
  guildId: string | null,
  rawArg: string,
  memberPermissions: string | null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  if (!hasGuildAdminPerms(memberPermissions)) {
    return replyEphemeral('Only server administrators can change the active agent model.')
  }

  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (!primary) {
    return replyEphemeral(TEXTS.noPrimaryHasBindings)
  }

  const assistant = await getAssistant(primary.assistant_id)
  if (!assistant || !assistant.org_id) {
    return replyEphemeral(TEXTS.agentNotFound)
  }

  const requested = rawArg.trim()
  if (!requested) {
    return replyEphemeral('Usage: `/model name:<model>`')
  }

  const models = await loadModelChoices()
  const matches = findMatchingModels(models, requested)

  if (matches.length === 0) {
    return replyEphemeral(
      `No model matched "${requested}". Run \`/models\` to inspect available options.`,
    )
  }

  if (matches.length > 1) {
    return replyEphemeral(
      [
        `Multiple models match "${requested}". Be more specific:`,
        summarizeModelChoices(matches),
      ].join('\n'),
    )
  }

  const target = matches[0]!
  await updateAssistant(
    assistant.id,
    { lucid_model: target.id },
    assistant.org_id,
  )

  return replyEphemeral(`Switched **${assistant.name}** to \`${target.id}\`.`)
}

export async function handleModelSelect(
  guildId: string,
  modelId: string,
  memberPermissions: string | null,
  userId: string,
  page = 0,
): Promise<DiscordReply> {
  if (!hasGuildAdminPerms(memberPermissions)) {
    return replyEphemeral('Only server administrators can change the active agent model.')
  }

  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (!primary) {
    return replyEphemeral(TEXTS.noPrimaryHasBindings)
  }

  const assistant = await getAssistant(primary.assistant_id)
  if (!assistant || !assistant.org_id) {
    return replyEphemeral(TEXTS.agentNotFound)
  }

  const models = await loadModelChoices()
  const target = models.find((model) => model.id === modelId)
  if (!target) {
    return replyEphemeral(
      `No model matched "${modelId}". Run \`/models\` to inspect available options.`,
    )
  }

  await updateAssistant(
    assistant.id,
    { lucid_model: target.id },
    assistant.org_id,
  )

  const refreshedChoices = mapGuildModelChoices(models, target.id)
  return replyEphemeral(
    [
      `Active agent: **${assistant.name}**`,
      `Current model: \`${target.id}\``,
      '',
      'Use `/model name:<model>` to switch by command, or pick another below.',
    ].join('\n'),
    modelsComponents(refreshedChoices, { guildId, userId, page }),
  )
}

export async function handleModelPage(
  guildId: string,
  page: number,
  memberPermissions: string | null,
  userId: string,
): Promise<DiscordReply> {
  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (!primary) {
    return replyEphemeral(TEXTS.noPrimaryHasBindings)
  }

  const assistant = await getAssistant(primary.assistant_id)
  if (!assistant) {
    return replyEphemeral(TEXTS.agentNotFound)
  }

  const models = await loadModelChoices()
  const components = modelsComponents(mapGuildModelChoices(models, assistant.lucid_model), {
    guildId,
    userId,
    page,
  })

  return replyEphemeral(
    [
      `Active agent: **${assistant.name}**`,
      `Current model: \`${assistant.lucid_model}\``,
      '',
      hasGuildAdminPerms(memberPermissions)
        ? 'Pick a model below or use `/model name:<model>`.'
        : 'Run `/models` to inspect the active model. Only admins can change it.',
    ].join('\n'),
    components,
  )
}

export async function handleLeaveCommand(
  guildId: string | null,
  memberPermissions: string | null,
  userId: string | null = null,
): Promise<DiscordReply> {
  if (!guildId) return replyEphemeral(TEXTS.guildOnly)

  if (!hasGuildAdminPerms(memberPermissions)) {
    return replyEphemeral(
      'Only server administrators can unbind an agent. Ask someone with **Manage Server** to run `/leave`.',
    )
  }

  const primary = await getPrimaryDiscordChannelForGuild(guildId)
  if (!primary) {
    return replyEphemeral('No active agent to unbind. Run `/agents` to pick one first.')
  }

  return replyEphemeral(
    'Are you sure you want to unbind the active agent from this server? Messages will no longer be routed.',
    userId ? leaveConfirmComponents({ guildId, userId, assistantId: primary.assistant_id }) : undefined,
  )
}

export async function handleLeaveConfirm(
  guildId: string,
  assistantId: string,
  memberPermissions: string | null,
): Promise<DiscordReply> {
  if (!hasGuildAdminPerms(memberPermissions)) {
    return replyEphemeral('Only server administrators can unbind an agent.')
  }

  await unbindDiscordChannel(guildId, assistantId)
  return replyEphemeral('Unbound. Use `/agents` to pick another, or reinstall via Lucid Studio.')
}

export function handleHelpCommand(): DiscordReply {
  return replyEphemeral(HELP_TEXT)
}

export const TEXTS = {
  onboarding: ONBOARDING_TEXT,
  help: HELP_TEXT,
  guildOnly: 'This command only works inside a server, not in DMs.',
  noPrimaryHasBindings: 'No active agent in this server. Run `/agents` to pick one.',
  agentNotFound: 'That agent does not exist or has been deleted.',
  bindFailed: 'Could not connect to that agent right now. Please try again.',
  installed: (name: string) => `Connected! **${name}** is now the active agent in this server.`,
} as const

export type { GuildBinding }
