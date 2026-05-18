import { NextRequest, NextResponse } from 'next/server'
import { fetchModels } from '@/lib/ai/models'
import {
  listDiscordChannelsForGuild,
  setPrimaryDiscordChannel,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { SHARED_VOICE_IDS } from '@/lib/media/voice-options'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import {
  handleAgentsCommand,
  handleAgentOpsCommand,
  handleHelpCommand,
  handleLeaveCommand,
  handleLeaveConfirm,
  handleModelCommand,
  handleModelPage,
  handleModelSelect,
  handleModelsCommand,
  handleProbeCommand,
  handleStatusCommand,
  handleSwitchCommand,
  handleVoiceChannelCommand,
  handleVoiceCommand,
  handleWhoamiCommand,
  TEXTS,
  type DiscordReply,
} from '@/lib/discord/hosted-commands'
import {
  agentsComponents,
  verifyCustomId,
} from '@/lib/discord/inline-keyboards'
import {
  INTERACTION_RESPONSE_TYPE,
  MESSAGE_FLAGS,
  parseInteractionPayload,
  type ParsedInteraction,
} from '@/lib/discord/hosted-router'
import { verifyDiscordSignature } from '@/lib/discord/signature-verify'
import { listChannelNativeCommandChoices } from '@/lib/agent-ops/channel-native'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const AUTOCOMPLETE_MAX = 25
const IDEMPOTENCY_TTL_SECONDS = 60

type DiscordResponseBody =
  | { type: typeof INTERACTION_RESPONSE_TYPE.PONG }
  | {
      type:
        | typeof INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE
        | typeof INTERACTION_RESPONSE_TYPE.UPDATE_MESSAGE
      data: {
        content?: string
        components?: DiscordReply['components']
        flags?: number
      }
    }
  | {
      type: typeof INTERACTION_RESPONSE_TYPE.AUTOCOMPLETE_RESULT
      data: { choices: Array<{ name: string; value: string }> }
    }

function replyFromDiscordReply(reply: DiscordReply): DiscordResponseBody {
  return {
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: reply.content,
      components: reply.components,
      flags: reply.flags,
    },
  }
}

async function sendDiscordFollowupMessages(
  parsed: Extract<ParsedInteraction, { kind: 'slash_command' | 'component' | 'modal_submit' }>,
  reply: DiscordReply,
): Promise<void> {
  const followups = reply.followupMessages?.filter((message) => message.trim().length > 0) ?? []
  if (followups.length === 0) return

  const applicationId = parsed.applicationId ?? process.env.DISCORD_APPLICATION_ID ?? null
  if (!applicationId) {
    console.warn('[DISCORD-WH] Cannot send follow-up chunks: missing application id')
    return
  }

  for (const content of followups) {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${applicationId}/${parsed.interactionToken}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content,
          ...(reply.flags ? { flags: reply.flags } : {}),
        }),
      },
    )
    if (!response.ok) {
      console.warn('[DISCORD-WH] Follow-up chunk failed:', response.status)
      return
    }
  }
}

function updateFromDiscordReply(reply: DiscordReply): DiscordResponseBody {
  return {
    type: INTERACTION_RESPONSE_TYPE.UPDATE_MESSAGE,
    data: {
      content: reply.content,
      components: reply.components,
    },
  }
}

function ephemeralError(content: string): DiscordResponseBody {
  return {
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: MESSAGE_FLAGS.EPHEMERAL },
  }
}

async function claimInteraction(interactionId: string): Promise<boolean> {
  const redis = await getPulseRedis()
  if (!redis) return true
  try {
    const result = await redis.set(
      `discord:interaction:${interactionId}`,
      '1',
      { nx: true, ex: IDEMPOTENCY_TTL_SECONDS },
    )
    return result === 'OK'
  } catch (error) {
    console.warn('[DISCORD-WH] Idempotency check failed (fail-open):', error)
    return true
  }
}

async function dispatchSlashCommand(
  parsed: Extract<ParsedInteraction, { kind: 'slash_command' }>,
): Promise<DiscordResponseBody> {
  switch (parsed.commandName) {
    case 'agents':
      return replyFromDiscordReply(await handleAgentsCommand(parsed.guildId, parsed.userId))
    case 'switch': {
      const nameOption = parsed.options.find((o) => o.name === 'name')
      const rawArg = typeof nameOption?.value === 'string' ? nameOption.value : ''
      return replyFromDiscordReply(await handleSwitchCommand(parsed.guildId, rawArg, parsed.userId))
    }
    case 'whoami':
      return replyFromDiscordReply(await handleWhoamiCommand(parsed.guildId, parsed.userId))
    case 'status':
      return replyFromDiscordReply(await handleStatusCommand(parsed.guildId))
    case 'ops': {
      const workflowOption = parsed.options.find((o) => o.name === 'workflow')
      const targetOption = parsed.options.find((o) => o.name === 'target')
      const workflow = typeof workflowOption?.value === 'string' ? workflowOption.value : ''
      const target = typeof targetOption?.value === 'string' ? targetOption.value : null
      const reply = await handleAgentOpsCommand({
        guildId: parsed.guildId,
        workflow,
        target,
        userId: parsed.userId,
      })
      void sendDiscordFollowupMessages(parsed, reply).catch((error) => {
        console.warn('[DISCORD-WH] Follow-up chunk delivery failed:', error)
      })
      return replyFromDiscordReply(reply)
    }
    case 'probe':
      return replyFromDiscordReply(await handleProbeCommand(parsed.guildId))
    case 'voice': {
      const modeOption = parsed.options.find((o) => o.name === 'mode')
      const voiceOption = parsed.options.find((o) => o.name === 'name')
      const rawMode = typeof modeOption?.value === 'string' ? modeOption.value : null
      const rawVoice = typeof voiceOption?.value === 'string' ? voiceOption.value : null
      return replyFromDiscordReply(
        await handleVoiceCommand({
          guildId: parsed.guildId,
          memberPermissions: parsed.memberPermissions,
          rawMode,
          rawVoice,
        }),
      )
    }
    case 'vc': {
      const actionOption = parsed.options.find((o) => o.name === 'action')
      const channelOption = parsed.options.find((o) => o.name === 'channel')
      const rawAction = typeof actionOption?.value === 'string' ? actionOption.value : null
      const rawChannelId =
        typeof channelOption?.value === 'string' ? channelOption.value : null
      return replyFromDiscordReply(
        await handleVoiceChannelCommand({
          guildId: parsed.guildId,
          memberPermissions: parsed.memberPermissions,
          rawAction,
          rawChannelId,
        }),
      )
    }
    case 'models':
      return replyFromDiscordReply(
        await handleModelsCommand(parsed.guildId, parsed.memberPermissions, parsed.userId),
      )
    case 'model': {
      const nameOption = parsed.options.find((o) => o.name === 'name')
      const rawArg = typeof nameOption?.value === 'string' ? nameOption.value : ''
      return replyFromDiscordReply(
        await handleModelCommand(parsed.guildId, rawArg, parsed.memberPermissions),
      )
    }
    case 'leave':
      return replyFromDiscordReply(
        await handleLeaveCommand(parsed.guildId, parsed.memberPermissions, parsed.userId),
      )
    case 'help':
      return replyFromDiscordReply(handleHelpCommand())
    default:
      return ephemeralError('Unknown command. Try `/help` to see what this bot can do.')
  }
}

async function dispatchAutocomplete(
  parsed: Extract<ParsedInteraction, { kind: 'autocomplete' }>,
): Promise<DiscordResponseBody> {
  if (!parsed.guildId) {
    return {
      type: INTERACTION_RESPONSE_TYPE.AUTOCOMPLETE_RESULT,
      data: { choices: [] },
    }
  }

  const prefix = (parsed.focusedOption?.value ?? '').toLowerCase()
  let choices: Array<{ name: string; value: string }> = []

  if (parsed.commandName === 'switch') {
    const bindings = await listDiscordChannelsForGuild(parsed.guildId)
    const filtered = prefix
      ? bindings.filter((b) => b.assistant_name.toLowerCase().includes(prefix))
      : bindings
    choices = filtered.slice(0, AUTOCOMPLETE_MAX).map((b) => ({
      name: b.assistant_name.length > 100 ? `${b.assistant_name.slice(0, 99)}...` : b.assistant_name,
      value: b.assistant_name,
    }))
  } else if (parsed.commandName === 'voice') {
    const voiceChoices = ['off', 'auto', 'always', ...SHARED_VOICE_IDS]
    const filtered = prefix
      ? voiceChoices.filter((choice) => choice.includes(prefix))
      : voiceChoices
    choices = filtered.slice(0, AUTOCOMPLETE_MAX).map((choice) => ({
      name: choice,
      value: choice,
    }))
  } else if (parsed.commandName === 'vc') {
    const voiceChoices = ['join', 'leave', 'status']
    const filtered = prefix
      ? voiceChoices.filter((choice) => choice.includes(prefix))
      : voiceChoices
    choices = filtered.slice(0, AUTOCOMPLETE_MAX).map((choice) => ({
      name: choice,
      value: choice,
    }))
  } else if (parsed.commandName === 'model') {
    const models = await fetchModels()
    const filtered = prefix
      ? models.filter((m) =>
          m.modelId.toLowerCase().includes(prefix) ||
          m.name.toLowerCase().includes(prefix) ||
          m.provider.toLowerCase().includes(prefix),
        )
      : models
    choices = filtered.slice(0, AUTOCOMPLETE_MAX).map((m) => ({
      name: `${m.provider}: ${m.name}`.slice(0, 100),
      value: m.modelId,
    }))
  } else if (parsed.commandName === 'ops') {
    choices = listChannelNativeCommandChoices(prefix)
  }

  return {
    type: INTERACTION_RESPONSE_TYPE.AUTOCOMPLETE_RESULT,
    data: { choices },
  }
}

async function dispatchComponent(
  parsed: Extract<ParsedInteraction, { kind: 'component' }>,
): Promise<DiscordResponseBody> {
  if (!parsed.guildId) return ephemeralError(TEXTS.guildOnly)

  const verified = verifyCustomId(parsed.customId)
  if (!verified) {
    return ephemeralError('This button has expired. Run `/agents` again to get a fresh one.')
  }

  if (verified.action === 'agents_select') {
    const boundGuild = verified.args[0]
    const boundUser = verified.args[1]
    const pageStr = verified.args[2]
    if (boundGuild !== parsed.guildId) {
      return ephemeralError('This selector was issued for a different server. Run `/agents` here.')
    }
    if (boundUser !== parsed.userId) {
      return ephemeralError('This selector belongs to a different user. Run `/agents` yourself.')
    }
    const assistantId = parsed.values[0]
    if (!assistantId) {
      return ephemeralError('No agent selected. Run `/agents` again.')
    }

    const result = await setPrimaryDiscordChannel(parsed.guildId, assistantId, false)
    if (!result.ok) {
      return ephemeralError('Could not switch to that agent. It may have been removed.')
    }

    const bindings = await listDiscordChannelsForGuild(parsed.guildId)
    const active = bindings.find((b) => b.assistant_id === assistantId)
    const page = Number.parseInt(pageStr ?? '0', 10)
    return updateFromDiscordReply({
      content: active ? `Switched to **${active.assistant_name}**.` : 'Switched.',
      components: agentsComponents(bindings, {
        guildId: parsed.guildId,
        userId: parsed.userId,
        page: Number.isFinite(page) && page >= 0 ? page : 0,
      }),
    })
  }

  if (verified.action === 'agents_page') {
    const boundGuild = verified.args[0]
    const boundUser = verified.args[1]
    const pageStr = verified.args[2]
    if (boundGuild !== parsed.guildId) {
      return ephemeralError('This button was issued for a different server. Run `/agents` here.')
    }
    if (boundUser !== parsed.userId) {
      return ephemeralError('This button belongs to a different user. Run `/agents` yourself.')
    }
    const page = Number.parseInt(pageStr ?? '0', 10)
    if (!Number.isFinite(page) || page < 0) {
      return ephemeralError('Invalid page. Run `/agents` again.')
    }
    const bindings = await listDiscordChannelsForGuild(parsed.guildId)
    return updateFromDiscordReply({
      content: 'Agents installed in this server - choose the one that should answer messages:',
      components: agentsComponents(bindings, { guildId: parsed.guildId, userId: parsed.userId, page }),
    })
  }

  if (verified.action === 'leave_confirm') {
    const boundGuild = verified.args[0]
    const boundUser = verified.args[1]
    const boundAssistant = verified.args[2]
    if (boundGuild !== parsed.guildId || !boundAssistant) {
      return ephemeralError('This button was issued for a different server. Run `/leave` here.')
    }
    if (boundUser !== parsed.userId) {
      return ephemeralError('This button belongs to a different user. Run `/leave` yourself.')
    }
    const reply = await handleLeaveConfirm(
      parsed.guildId,
      boundAssistant,
      parsed.memberPermissions,
    )
    return updateFromDiscordReply(reply)
  }

  if (verified.action === 'leave_cancel') {
    const boundGuild = verified.args[0]
    const boundUser = verified.args[1]
    if (boundGuild !== parsed.guildId) {
      return ephemeralError('This button was issued for a different server. Run `/leave` here.')
    }
    if (boundUser !== parsed.userId) {
      return ephemeralError('This button belongs to a different user. Run `/leave` yourself.')
    }
    return updateFromDiscordReply({
      content: 'Cancelled. Nothing was changed.',
      components: [],
    })
  }

  if (verified.action === 'model_select') {
    const boundGuild = verified.args[0]
    const boundUser = verified.args[1]
    const pageStr = verified.args[2]
    if (boundGuild !== parsed.guildId) {
      return ephemeralError('This selector was issued for a different server. Run `/models` here.')
    }
    if (boundUser !== parsed.userId) {
      return ephemeralError('This selector belongs to a different user. Run `/models` yourself.')
    }
    const modelId = parsed.values[0]
    if (!modelId) {
      return ephemeralError('No model selected. Run `/models` again.')
    }
    const page = Number.parseInt(pageStr ?? '0', 10)
    const reply = await handleModelSelect(
      parsed.guildId,
      modelId,
      parsed.memberPermissions,
      parsed.userId,
      Number.isFinite(page) && page >= 0 ? page : 0,
    )
    return updateFromDiscordReply(reply)
  }

  if (verified.action === 'model_page') {
    const boundGuild = verified.args[0]
    const boundUser = verified.args[1]
    const pageStr = verified.args[2]
    if (boundGuild !== parsed.guildId) {
      return ephemeralError('This button was issued for a different server. Run `/models` here.')
    }
    if (boundUser !== parsed.userId) {
      return ephemeralError('This button belongs to a different user. Run `/models` yourself.')
    }
    const page = Number.parseInt(pageStr ?? '0', 10)
    if (!Number.isFinite(page) || page < 0) {
      return ephemeralError('Invalid page. Run `/models` again.')
    }
    const reply = await handleModelPage(parsed.guildId, page, parsed.memberPermissions, parsed.userId)
    return updateFromDiscordReply(reply)
  }

  return ephemeralError('Unknown interaction. Run `/help` to see what this bot can do.')
}

async function dispatchInteraction(
  parsed: ParsedInteraction,
  reqId: string,
): Promise<DiscordResponseBody> {
  switch (parsed.kind) {
    case 'ping':
      return { type: INTERACTION_RESPONSE_TYPE.PONG }

    case 'slash_command': {
      const fresh = await claimInteraction(parsed.interactionId)
      if (!fresh) {
        return ephemeralError('Already processed - please wait a moment and try again.')
      }
      return dispatchSlashCommand(parsed)
    }

    case 'autocomplete':
      return dispatchAutocomplete(parsed)

    case 'component': {
      const fresh = await claimInteraction(parsed.interactionId)
      if (!fresh) {
        return ephemeralError('Already processed - please wait a moment and try again.')
      }
      return dispatchComponent(parsed)
    }

    case 'modal_submit':
      return ephemeralError('Modal submissions are not handled by this bot yet.')

    case 'unknown':
    default:
      console.warn(
        `[DISCORD-WH][${reqId}] Unknown interaction: ${'reason' in parsed ? parsed.reason : 'n/a'}`,
      )
      return ephemeralError('Unsupported interaction. Run `/help` to see what this bot can do.')
  }
}

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8)

  const publicKeyHex = process.env.DISCORD_HOSTED_PUBLIC_KEY
  if (!publicKeyHex) {
    console.error(`[DISCORD-WH][${reqId}] DISCORD_HOSTED_PUBLIC_KEY is not set`)
    return new NextResponse('missing_public_key', { status: 401 })
  }

  const signatureHex = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  if (!signatureHex || !timestamp) {
    return new NextResponse('missing_signature', { status: 401 })
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (error) {
    console.error(`[DISCORD-WH][${reqId}] Failed to read request body:`, error)
    return new NextResponse('bad_body', { status: 400 })
  }

  const signatureValid = verifyDiscordSignature({
    publicKeyHex,
    signatureHex,
    timestamp,
    rawBody,
  })
  if (!signatureValid) {
    console.warn(`[DISCORD-WH][${reqId}] Invalid Ed25519 signature`)
    return new NextResponse('invalid_signature', { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch (error) {
    console.error(`[DISCORD-WH][${reqId}] Invalid JSON body:`, error)
    return new NextResponse('bad_json', { status: 400 })
  }

  const parsed = parseInteractionPayload(body)

  try {
    const response = await dispatchInteraction(parsed, reqId)
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[DISCORD-WH][${reqId}] UNHANDLED ERROR:`, message)
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/discord/interactions', method: 'POST', reqId },
      tags: { layer: 'api', route: 'discord-hosted-interactions' },
    })
    return NextResponse.json(ephemeralError('Something went wrong. Please try again.'))
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'discord-hosted-interactions' })
}
