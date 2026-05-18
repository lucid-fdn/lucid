import 'server-only'

import {
  getPrimaryHostedIMessageChannelForChat,
  listHostedIMessageChannelsForChat,
  setPrimaryHostedIMessageChannel,
  upsertHostedIMessageChannel,
} from '@/lib/db'
import { resolveAgentTarget } from '@/lib/channels/agent-target-resolver'
import {
  buildAgentOpsChannelCommandUsage,
  normalizeAgentOpsChannelCommandArg,
  parseChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { runChannelNativeActionChunks, type ChannelNativeActionInput } from '@/lib/db/channel-native-actions'

type HostedBinding = Awaited<ReturnType<typeof listHostedIMessageChannelsForChat>>[number]

const commandLikePattern = /^(help|agents|whoami|status|ops|agentops|check|page|test|funnel|research|plan|search|remember|claims|extract|scrape|monitor|watch|portal|operate|repro|reproduce|support|switch)\b/i

export type HostedIMessageResolution =
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

function buildAgentsReply(bindings: HostedBinding[]): string {
  const lines = bindings.map((binding) =>
    binding.is_primary ? `* ${binding.assistant_name} (active)` : `- ${binding.assistant_name}`,
  )
  return `Agents in this iMessage chat:\n${lines.join('\n')}\n\nSend "switch <agent name>" to change who speaks, "ops <workflow> <target>" or "check <url>" to launch Agent Ops, or "whoami" to inspect the current agent.`
}

function buildWhoamiReply(binding: HostedBinding): string {
  const firstLine = binding.assistant_description?.trim().split('\n', 1)[0] ?? ''
  return firstLine
    ? `Currently chatting with ${binding.assistant_name}\n${firstLine}`
    : `Currently chatting with ${binding.assistant_name}`
}

export async function resolveHostedIMessageInbound(params: {
  chatId: string
  text: string
  hostedSurfaceId: string
  resolveSurfaceDefault: () => Promise<{ channelId: string; assistantId: string } | null>
  sendText: (text: string) => Promise<void>
}): Promise<HostedIMessageResolution> {
  const trimmed = params.text.trim()
  const bindings = await listHostedIMessageChannelsForChat(params.chatId)

  if (bindings.length === 0) {
    const hasCommandLikeText = commandLikePattern.test(trimmed)
    const rawAgentOpsCommand = normalizeAgentOpsChannelCommandArg(trimmed)
    if (rawAgentOpsCommand !== null) {
      const command = parseChannelNativeCommand(rawAgentOpsCommand)
      if (!command) {
        await params.sendText(buildAgentOpsChannelCommandUsage('iMessage'))
        return { kind: 'handled' }
      }

      const surfaceDefault = await params.resolveSurfaceDefault()
      if (!surfaceDefault) {
        await params.sendText('No default Lucid agent is configured for this hosted iMessage surface yet.')
        return { kind: 'handled' }
      }

      await sendChannelNativeActionChunks(params.sendText, {
        channelType: 'imessage',
        channelLabel: 'iMessage',
        surfaceId: params.chatId,
        rawCommandArg: rawAgentOpsCommand,
        binding: {
          assistant_id: surfaceDefault.assistantId,
        },
      })
      return { kind: 'handled' }
    }

    if (!hasCommandLikeText) {
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
      'No default Lucid agent is configured for this hosted iMessage surface yet.',
    )
    return { kind: 'handled' }
  }

  if (/^help$/i.test(trimmed)) {
    await params.sendText(
      'Commands:\nhelp\nagents\nwhoami\nstatus\nops <workflow> <target>\ncheck <url>\nresearch <url>\nplan <goal>\nsearch <query>\nremember <fact>\nclaims <query>\nforget <id>\nextract <what> from <url>\nmonitor <url>\nswitch <agent name>\n\nOr just send a normal message to talk to the active agent.',
    )
    return { kind: 'handled' }
  }

  const rawAgentOpsCommand = normalizeAgentOpsChannelCommandArg(trimmed)
  if (rawAgentOpsCommand !== null) {
    const command = parseChannelNativeCommand(rawAgentOpsCommand)
    if (!command) {
      await params.sendText(buildAgentOpsChannelCommandUsage('iMessage'))
      return { kind: 'handled' }
    }

    const primary = await getPrimaryHostedIMessageChannelForChat(params.chatId)
    const active = primary
      ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
      : bindings.find((binding) => binding.is_primary) ?? bindings[0]
    if (!active) {
      await params.sendText('No agent is active in this iMessage chat right now. Reply "agents" to pick one.')
      return { kind: 'handled' }
    }

    await sendChannelNativeActionChunks(params.sendText, {
      channelType: 'imessage',
      channelLabel: 'iMessage',
      surfaceId: params.chatId,
      rawCommandArg: rawAgentOpsCommand,
      binding: active,
    })
    return { kind: 'handled' }
  }

  if (/^agents$/i.test(trimmed)) {
    await params.sendText(buildAgentsReply(bindings))
    return { kind: 'handled' }
  }

  if (/^(whoami|status)$/i.test(trimmed)) {
    const active = bindings.find((binding) => binding.is_primary) ?? bindings[0]
    if (!active) {
      await params.sendText('No agent is active in this chat right now.')
      return { kind: 'handled' }
    }

    await params.sendText(buildWhoamiReply(active))
    return { kind: 'handled' }
  }

  const switchMatch = /^switch\s+(.+)$/i.exec(trimmed)
  if (switchMatch) {
    const resolution = resolveAgentTarget({
      bindings,
      explicitTarget: switchMatch[1]!.trim().toLowerCase(),
    })
    if (resolution.kind !== 'resolved') {
      await params.sendText(
        'I could not uniquely match that agent in this iMessage chat. Reply "agents" to see what is available.',
      )
      return { kind: 'handled' }
    }

    const target = resolution.binding
    if (target.is_primary) {
      await params.sendText(`${target.assistant_name} is already active in this iMessage chat.`)
      return { kind: 'handled' }
    }

    const upserted = await upsertHostedIMessageChannel({
      assistantId: target.assistant_id,
      imessageChatId: params.chatId,
      hostedSurfaceId: params.hostedSurfaceId,
      setPrimary: true,
    })

    const switched = await setPrimaryHostedIMessageChannel({
      imessageChatId: params.chatId,
      channelId: upserted.channelId,
    })
    if (!switched) {
      await params.sendText('I could not switch agents right now. Please try again.')
      return { kind: 'handled' }
    }

    await params.sendText(`${target.assistant_name} is now active in this iMessage chat.`)
    return { kind: 'handled' }
  }

  const primary = await getPrimaryHostedIMessageChannelForChat(params.chatId)
  const active = primary
    ? bindings.find((binding) => binding.assistant_id === primary.assistant_id) ?? bindings[0]
    : bindings[0]

  if (!active) {
    const surfaceDefault = await params.resolveSurfaceDefault()
    if (surfaceDefault) {
      return {
        kind: 'route',
        channelId: surfaceDefault.channelId,
        assistantId: surfaceDefault.assistantId,
      }
    }

    await params.sendText('No agent is active in this iMessage chat right now.')
    return { kind: 'handled' }
  }

  return {
    kind: 'route',
    channelId: active.id,
    assistantId: active.assistant_id,
  }
}
