import 'server-only'

import {
  consumeWhatsAppConnectToken,
  getAssistant,
  getPrimaryWhatsAppChannelForChat,
  getWhatsAppVoiceSettingsForChat,
  listWhatsAppChannelsForChat,
  setPrimaryWhatsAppChannel,
  unbindWhatsAppChannel,
  updateWhatsAppVoiceSettingsForChat,
  upsertHostedWhatsAppChannel,
} from '@/lib/db'
import { SHARED_VOICE_IDS, normalizeSharedVoiceId } from '@/lib/media/voice-options'
import { resolveAgentTarget } from '@/lib/channels/agent-target-resolver'
import {
  buildAgentOpsChannelCommandUsage,
  normalizeAgentOpsChannelCommandArg,
  parseChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { runChannelNativeActionChunks, type ChannelNativeActionInput } from '@/lib/db/channel-native-actions'

type HostedBinding = Awaited<ReturnType<typeof listWhatsAppChannelsForChat>>[number]

const commandLikePattern = /^(help|agents|whoami|status|voice|ops|agentops|check|page|test|funnel|buy|purchase|shop|groceries|research|plan|search|remember|claims|extract|scrape|monitor|watch|portal|operate|repro|reproduce|support|switch|leave)\b/i

export type HostedWhatsAppResolution =
  | { kind: 'handled' }
  | { kind: 'route'; channelId: string; assistantId: string }

async function sendChannelNativeActionChunks(
  sendText: (text: string) => Promise<void>,
  input: ChannelNativeActionInput,
): Promise<void> {
  for (const chunk of await runChannelNativeActionChunks(input)) {
    await sendText(chunk)
  }
}

export function extractWhatsAppConnectToken(text: string): string | null {
  const match = /^\s*connect\s+([a-z0-9-]+)\s*$/i.exec(text)
  return match?.[1] ?? null
}

function buildAgentsReply(bindings: HostedBinding[]): string {
  const lines = bindings.map((binding) =>
    binding.is_primary ? `* ${binding.assistant_name} (active)` : `- ${binding.assistant_name}`,
  )
  return `Agents in this chat:\n${lines.join('\n')}\n\nReply with "switch <agent name>" to change who speaks. Reply "whoami" to inspect the active agent or "leave" to disconnect it.`
}

function buildConnectReply(assistantName: string | null): string {
  if (!assistantName) {
    return 'Your Lucid agent is now connected here. Send a message to begin.'
  }

  return `${assistantName} is now connected here.\n\nSend a message to begin. Reply "agents" to see who else is available, "whoami" to inspect the active agent, or "help" for commands.`
}

function buildWhoamiReply(binding: HostedBinding): string {
  const firstLine = binding.assistant_description?.trim().split('\n', 1)[0] ?? ''
  return firstLine
    ? `Currently chatting with ${binding.assistant_name}\n${firstLine}`
    : `Currently chatting with ${binding.assistant_name}`
}

function buildVoiceReply(settings: {
  assistantName: string
  mode: 'off' | 'auto' | 'always'
  voiceId: string | null
}): string {
  return [
    `${settings.assistantName} voice replies`,
    `Mode: ${settings.mode}`,
    `Voice: ${settings.voiceId || 'default'}`,
    '',
    'Commands:',
    'voice',
    'voice off',
    'voice auto',
    'voice always',
    'voice set <voice>',
    `voices: ${SHARED_VOICE_IDS.join(', ')}`,
  ].join('\n')
}

function normalizeWhatsAppVoiceId(rawVoice: string): string | null {
  return normalizeSharedVoiceId(rawVoice)
}

export async function resolveHostedWhatsAppInbound(params: {
  chatId: string
  text: string
  hostedSurfaceId: string
  resolveSurfaceDefault?: () => Promise<{ channelId: string; assistantId: string } | null>
  sendText: (text: string) => Promise<void>
}): Promise<HostedWhatsAppResolution> {
  const connectToken = extractWhatsAppConnectToken(params.text)
  if (connectToken) {
    const tokenData = await consumeWhatsAppConnectToken(connectToken)
    if (!tokenData) {
      await params.sendText(
        'That connect link is invalid or expired. Generate a new WhatsApp connect link from Lucid.',
      )
      return { kind: 'handled' }
    }

    const assistant = await getAssistant(tokenData.assistantId)
    await upsertHostedWhatsAppChannel({
      assistantId: tokenData.assistantId,
      whatsappChatId: params.chatId,
      hostedSurfaceId: params.hostedSurfaceId,
      setPrimary: true,
    })

    await params.sendText(buildConnectReply(assistant?.name ?? null))
    return { kind: 'handled' }
  }

  const bindings = await listWhatsAppChannelsForChat(params.chatId)
  if (bindings.length === 0) {
    const rawAgentOpsCommand = normalizeAgentOpsChannelCommandArg(params.text)
    if (rawAgentOpsCommand !== null) {
      const command = parseChannelNativeCommand(rawAgentOpsCommand)
      if (!command) {
        await params.sendText(buildAgentOpsChannelCommandUsage('WhatsApp'))
        return { kind: 'handled' }
      }

      const surfaceDefault = params.resolveSurfaceDefault ? await params.resolveSurfaceDefault() : null
      if (!surfaceDefault) {
        await params.sendText('No Lucid agent is active in this WhatsApp chat yet. Connect an agent first, then retry the Agent Ops command.')
        return { kind: 'handled' }
      }

      await sendChannelNativeActionChunks(params.sendText, {
        channelType: 'whatsapp',
        channelLabel: 'WhatsApp',
        surfaceId: params.chatId,
        rawCommandArg: rawAgentOpsCommand,
        binding: {
          assistant_id: surfaceDefault.assistantId,
        },
      })
      return { kind: 'handled' }
    }

    const hasCommandLikeText = commandLikePattern.test(params.text.trim())
    if (!hasCommandLikeText && params.resolveSurfaceDefault) {
      const surfaceDefault = await params.resolveSurfaceDefault()
      if (surfaceDefault) {
        return {
          kind: 'route',
          channelId: surfaceDefault.channelId,
          assistantId: surfaceDefault.assistantId,
        }
      }
    }
    await params.sendText(
      'No Lucid agent is connected to this chat yet. Start from the Lucid dashboard and use the WhatsApp connect link first.',
    )
    return { kind: 'handled' }
  }

  if (/^help$/i.test(params.text)) {
    await params.sendText(
      'Commands:\nhelp\nagents\nwhoami\nstatus\nvoice\nvoice off\nvoice auto\nvoice always\nvoice set <voice>\nops <workflow> <target>\ncheck <url>\nbuy <request>\nresearch <url>\nplan <goal>\nsearch <query>\nremember <fact>\nclaims <query>\nforget <id>\nextract <what> from <url>\nmonitor <url>\nswitch <agent name>\nleave\n\nOr just send a normal message to talk to the active agent.',
    )
    return { kind: 'handled' }
  }

  const rawAgentOpsCommand = normalizeAgentOpsChannelCommandArg(params.text)
  if (rawAgentOpsCommand !== null) {
    const command = parseChannelNativeCommand(rawAgentOpsCommand)
    if (!command) {
      await params.sendText(buildAgentOpsChannelCommandUsage('WhatsApp'))
      return { kind: 'handled' }
    }

    const primary = await getPrimaryWhatsAppChannelForChat(params.chatId)
    const active = primary
      ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
      : bindings.find((binding) => binding.is_primary)
    if (!active) {
      await params.sendText('No agent is active in this chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    await sendChannelNativeActionChunks(params.sendText, {
      channelType: 'whatsapp',
      channelLabel: 'WhatsApp',
      surfaceId: params.chatId,
      rawCommandArg: rawAgentOpsCommand,
      binding: active,
    })
    return { kind: 'handled' }
  }

  if (/^agents$/i.test(params.text)) {
    await params.sendText(buildAgentsReply(bindings))
    return { kind: 'handled' }
  }

  if (/^(whoami|status)$/i.test(params.text)) {
    const primary = await getPrimaryWhatsAppChannelForChat(params.chatId)
    const active = primary
      ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
      : bindings[0]

    if (!active) {
      await params.sendText('No agent is active in this chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    await params.sendText(
      [
        buildWhoamiReply(active),
        bindings.length > 1
          ? `${bindings.length - 1} more agent${bindings.length === 2 ? '' : 's'} can be switched in with "switch <agent name>".`
          : 'No other agents are linked to this chat yet.',
      ].join('\n\n'),
    )
    return { kind: 'handled' }
  }

  if (/^voice$/i.test(params.text)) {
    const settings = await getWhatsAppVoiceSettingsForChat(params.chatId)
    if (!settings) {
      await params.sendText('No agent is active in this chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    await params.sendText(
      buildVoiceReply({
        assistantName: settings.assistantName,
        mode: settings.mode,
        voiceId: settings.voiceId,
      }),
    )
    return { kind: 'handled' }
  }

  const voiceMatch = /^voice\s+(off|auto|always)$/i.exec(params.text)
  if (voiceMatch) {
    const nextMode = voiceMatch[1]!.toLowerCase() as 'off' | 'auto' | 'always'
    const updated = await updateWhatsAppVoiceSettingsForChat({
      chatId: params.chatId,
      mode: nextMode,
    })
    if (!updated) {
      await params.sendText('No agent is active in this chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    await params.sendText(
      buildVoiceReply({
        assistantName: updated.assistantName,
        mode: updated.mode,
        voiceId: updated.voiceId,
      }),
    )
    return { kind: 'handled' }
  }

  const voiceSetMatch = /^voice\s+set\s+(.+)$/i.exec(params.text)
  if (voiceSetMatch) {
    const nextVoice = normalizeWhatsAppVoiceId(voiceSetMatch[1] ?? '')
    if (!nextVoice) {
      await params.sendText(`Unsupported voice. Available voices: ${SHARED_VOICE_IDS.join(', ')}`)
      return { kind: 'handled' }
    }
    const updated = await updateWhatsAppVoiceSettingsForChat({
      chatId: params.chatId,
      voiceId: nextVoice,
    })
    if (!updated) {
      await params.sendText('No agent is active in this chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    await params.sendText(
      buildVoiceReply({
        assistantName: updated.assistantName,
        mode: updated.mode,
        voiceId: updated.voiceId,
      }),
    )
    return { kind: 'handled' }
  }

  const switchMatch = /^switch\s+(.+)$/i.exec(params.text)
  if (switchMatch) {
    const targetName = switchMatch[1].trim().toLowerCase()
    const resolution = resolveAgentTarget({
      bindings,
      explicitTarget: targetName,
    })
    if (resolution.kind !== 'resolved') {
      await params.sendText(
        'I could not uniquely match that agent in this chat. Reply "agents" to see the available names.',
      )
      return { kind: 'handled' }
    }
    const target = resolution.binding

    if (target.is_primary) {
      await params.sendText(`${target.assistant_name} is already active in this chat.`)
      return { kind: 'handled' }
    }

    const switched = await setPrimaryWhatsAppChannel({
      whatsappChatId: params.chatId,
      channelId: target.id,
    })
    if (!switched) {
      await params.sendText('I could not switch agents right now. Please try again.')
      return { kind: 'handled' }
    }

    await params.sendText(`${target.assistant_name} is now active in this chat.`)
    return { kind: 'handled' }
  }

  if (/^leave$/i.test(params.text)) {
    const primary = await getPrimaryWhatsAppChannelForChat(params.chatId)
    if (!primary) {
      await params.sendText('No agent is active in this chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    const active = bindings.find((binding) => binding.assistant_id === primary.assistant_id)
    await unbindWhatsAppChannel(params.chatId, primary.assistant_id)
    await params.sendText(
      active
        ? `${active.assistant_name} stepped out of this chat. Reply "agents" to bring another one in.`
        : 'That agent stepped out of this chat. Reply "agents" to bring another one in.',
    )
    return { kind: 'handled' }
  }

  const primary = await getPrimaryWhatsAppChannelForChat(params.chatId)
  const conversationDefault = primary
    ? bindings.find((binding) => binding.assistant_id === primary.assistant_id) ?? null
    : bindings.find((binding) => binding.is_primary) ?? null
  const surfaceDefault = params.resolveSurfaceDefault
    ? await params.resolveSurfaceDefault()
    : null
  const resolution = resolveAgentTarget({
    bindings,
    conversationDefault,
    surfaceDefault: surfaceDefault
      ? {
          id: surfaceDefault.channelId,
          assistant_id: surfaceDefault.assistantId,
          assistant_name: 'Default agent',
          assistant_description: null,
          is_primary: false,
          aliases: [],
        }
      : null,
  })

  if (resolution.kind !== 'resolved') {
    const message =
      resolution.kind === 'unresolved' && resolution.reason === 'no_binding_available'
        ? 'No Lucid agent is connected to this chat yet. Start from the Lucid dashboard and use the WhatsApp connect link first.'
        : 'No agent is active in this chat right now. Reply "agents" to pick one.'
    await params.sendText(message)
    return { kind: 'handled' }
  }

  return {
    kind: 'route',
    channelId: resolution.binding.id,
    assistantId: resolution.binding.assistant_id,
  }
}
