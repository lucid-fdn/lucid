import 'server-only'

import {
  bindHostedTeamsChannel,
  getPrimaryTeamsChannelForConversation,
  listTeamsChannelsForConversation,
  listPendingTeamsChannelsForTenant,
  setPrimaryTeamsChannel,
  unbindTeamsChannel,
} from '@/lib/db'
import { resolveAgentTarget } from '@/lib/channels/agent-target-resolver'
import {
  buildAgentOpsChannelCommandUsage,
  normalizeAgentOpsChannelCommandArg,
  parseChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { runChannelNativeActionChunks, type ChannelNativeActionInput } from '@/lib/db/channel-native-actions'

type TeamsBinding = Awaited<ReturnType<typeof listTeamsChannelsForConversation>>[number]
type PendingTeamsBinding = Awaited<ReturnType<typeof listPendingTeamsChannelsForTenant>>[number]

const commandLikePattern = /^(help|whoami|status|agents|ops|agentops|check|page|test|funnel|buy|purchase|shop|groceries|research|plan|search|remember|claims|extract|scrape|monitor|watch|portal|operate|repro|reproduce|support|bind(?:\s+.+)?|switch(?:\s+.+)?|leave)\b/i

export type HostedTeamsResolution =
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

function buildAgentsReply(bindings: TeamsBinding[]): string {
  const lines = bindings.map((binding) =>
    binding.is_primary ? `* ${binding.assistant_name} (active)` : `- ${binding.assistant_name}`,
  )
  return `Agents in this Teams conversation:\n${lines.join('\n')}\n\nType "switch <agent name>" to change who replies. Type "whoami" to inspect the active agent or "leave" to disconnect it.`
}

function buildAvailableAgentsReply(params: {
  current?: TeamsBinding | null
  pending: PendingTeamsBinding[]
}): string {
  const lines: string[] = []
  if (params.current) {
    lines.push(`* ${params.current.assistant_name} (active here)`)
  }
  for (const binding of params.pending) {
    lines.push(`- ${binding.assistant_name} (ready to bind here)`)
  }

  return [
    'Agents available for this Teams conversation:',
    ...lines,
    '',
    params.pending.length > 0
      ? 'Type "switch <agent name>" to swap the active agent, or "bind <agent name>" if nothing is active yet.'
      : 'No additional installed agents are ready for this conversation yet.',
  ].join('\n')
}

function buildWhoamiReply(binding: TeamsBinding): string {
  const firstLine = binding.assistant_description?.trim().split('\n', 1)[0] ?? ''
  return firstLine
    ? `Currently chatting with ${binding.assistant_name}\n${firstLine}`
    : `Currently chatting with ${binding.assistant_name}`
}

function buildPendingAgentsReply(bindings: Awaited<ReturnType<typeof listPendingTeamsChannelsForTenant>>): string {
  const lines = bindings.map((binding) => `- ${binding.assistant_name}`)
  return `Lucid is installed for this Teams tenant, but no agent is bound to this conversation yet.\n\nReady to bind:\n${lines.join('\n')}\n\nType "bind" to bind the only installed agent here, or "bind <agent name>" when multiple agents are ready.`
}

export async function resolveHostedTeamsInbound(params: {
  conversationId: string
  tenantId: string | null
  text: string
  serviceUrl?: string
  resolveSurfaceDefault?: () => Promise<{ channelId: string; assistantId: string } | null>
  sendText: (text: string) => Promise<void>
}): Promise<HostedTeamsResolution> {
  const bindings = await listTeamsChannelsForConversation(params.conversationId)
  const hasCommandLikeText = commandLikePattern.test(params.text.trim())
  if (bindings.length === 0) {
    const rawAgentOpsCommand = normalizeAgentOpsChannelCommandArg(params.text)
    if (rawAgentOpsCommand !== null) {
      const command = parseChannelNativeCommand(rawAgentOpsCommand)
      if (!command) {
        await params.sendText(buildAgentOpsChannelCommandUsage('Teams'))
        return { kind: 'handled' }
      }

      const surfaceDefault = params.resolveSurfaceDefault ? await params.resolveSurfaceDefault() : null
      if (!surfaceDefault) {
        await params.sendText('No Lucid agent is active in this Teams conversation yet. Run "bind" first, then retry the Agent Ops command.')
        return { kind: 'handled' }
      }

      await sendChannelNativeActionChunks(params.sendText, {
        channelType: 'msteams',
        channelLabel: 'Teams',
        surfaceId: params.conversationId,
        rawCommandArg: rawAgentOpsCommand,
        binding: {
          assistant_id: surfaceDefault.assistantId,
        },
      })
      return { kind: 'handled' }
    }

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

    const pendingBindings = params.tenantId
      ? await listPendingTeamsChannelsForTenant(params.tenantId)
      : []

    if (/^help$/i.test(params.text)) {
      await params.sendText(
        'Commands:\nhelp\nbind\nbind <agent name>\nops <workflow> <target>\ncheck <url>\nbuy <request>\nresearch <url>\nplan <goal>\nsearch <query>\nremember <fact>\nclaims <query>\nforget <id>\nextract <what> from <url>\nmonitor <url>\n\nInstall an agent from Lucid, then run "bind" in the Teams conversation where it should be active.',
      )
      return { kind: 'handled' }
    }

    if (/^(whoami|status)$/i.test(params.text)) {
      await params.sendText(
        pendingBindings.length > 0
          ? 'No Lucid agent is active in this Teams conversation yet. Run "bind" here to attach one of the installed agents.'
          : 'No Lucid agent is connected to this Teams conversation yet. Install one from Lucid Studio first.',
      )
      return { kind: 'handled' }
    }

    if (/^agents$/i.test(params.text)) {
      await params.sendText(
        pendingBindings.length > 0
          ? buildPendingAgentsReply(pendingBindings)
          : 'No Lucid agents are installed for this Teams tenant yet. Install one from Lucid Studio first.',
      )
      return { kind: 'handled' }
    }

    const bindMatch = /^bind(?:\s+(.+))?$/i.exec(params.text)
    if (bindMatch) {
      if (!params.tenantId) {
        await params.sendText('I could not determine the Teams tenant for this conversation. Try again in a moment.')
        return { kind: 'handled' }
      }
      if (pendingBindings.length === 0) {
        await params.sendText('No unbound Lucid agents are installed for this Teams tenant yet. Install one from Lucid Studio first.')
        return { kind: 'handled' }
      }

      const requestedName = bindMatch[1]?.trim().toLowerCase() || null
      const resolution = resolveAgentTarget({
        bindings: pendingBindings,
        explicitTarget: requestedName,
        conversationDefault: !requestedName && pendingBindings.length === 1 ? pendingBindings[0] : null,
      })

      if (resolution.kind !== 'resolved') {
        await params.sendText(
          requestedName
            ? 'I could not uniquely match that installed agent for this Teams tenant. Type "agents" to see what is ready to bind.'
            : 'Multiple Lucid agents are installed for this Teams tenant. Type "bind <agent name>" to choose one.',
        )
        return { kind: 'handled' }
      }
      const target = resolution.binding

      const bound = await bindHostedTeamsChannel({
        conversationId: params.conversationId,
        channelId: target.id,
        serviceUrl: params.serviceUrl,
      })
      if (!bound) {
        await params.sendText('I could not bind that agent to this Teams conversation right now. Please try again.')
        return { kind: 'handled' }
      }

      await params.sendText(`${target.assistant_name} is now active in this Teams conversation.`)
      return { kind: 'handled' }
    }

    await params.sendText(
      pendingBindings.length > 0
        ? 'No Lucid agent is active in this Teams conversation yet. Run "bind" here to attach one of the installed agents.'
        : 'No Lucid agent is connected to this Teams conversation yet. Install one from Lucid Studio first.',
    )
    return { kind: 'handled' }
  }

    if (/^help$/i.test(params.text)) {
      await params.sendText(
        'Commands:\nhelp\nagents\nwhoami\nstatus\nops <workflow> <target>\ncheck <url>\nbuy <request>\nresearch <url>\nplan <goal>\nsearch <query>\nremember <fact>\nclaims <query>\nforget <id>\nextract <what> from <url>\nmonitor <url>\nswitch <agent name>\nleave\n\nOr just send a normal message to talk to the active agent.',
      )
      return { kind: 'handled' }
    }

    const rawAgentOpsCommand = normalizeAgentOpsChannelCommandArg(params.text)
    if (rawAgentOpsCommand !== null) {
      const command = parseChannelNativeCommand(rawAgentOpsCommand)
      if (!command) {
        await params.sendText(buildAgentOpsChannelCommandUsage('Teams'))
        return { kind: 'handled' }
      }

      const primary = await getPrimaryTeamsChannelForConversation(params.conversationId)
      const active = primary
        ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
        : bindings.find((binding) => binding.is_primary) ?? bindings[0]
      if (!active) {
        await params.sendText('No agent is active in this Teams conversation right now. Type "agents" to pick one.')
        return { kind: 'handled' }
      }

      await sendChannelNativeActionChunks(params.sendText, {
        channelType: 'msteams',
        channelLabel: 'Teams',
        surfaceId: params.conversationId,
        rawCommandArg: rawAgentOpsCommand,
        binding: active,
      })
      return { kind: 'handled' }
    }

    if (/^agents$/i.test(params.text)) {
      const primary = await getPrimaryTeamsChannelForConversation(params.conversationId)
      const active = primary
        ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
        : bindings[0]
      const pendingBindings = params.tenantId
        ? await listPendingTeamsChannelsForTenant(params.tenantId)
        : []

      if (pendingBindings.length > 0) {
        await params.sendText(
          buildAvailableAgentsReply({
            current: active,
            pending: pendingBindings,
          }),
        )
      } else {
        await params.sendText(buildAgentsReply(bindings))
      }
      return { kind: 'handled' }
    }

    if (/^(whoami|status)$/i.test(params.text)) {
      const primary = await getPrimaryTeamsChannelForConversation(params.conversationId)
      const active = primary
        ? bindings.find((binding) => binding.assistant_id === primary.assistant_id)
      : bindings[0]

    if (!active) {
      await params.sendText('No agent is active in this conversation right now. Type "agents" to inspect the installed agents.')
      return { kind: 'handled' }
    }
      const pendingBindings = params.tenantId
        ? await listPendingTeamsChannelsForTenant(params.tenantId)
        : []

      const detailLines = [buildWhoamiReply(active)]
      if (pendingBindings.length > 0) {
        detailLines.push(
          `${pendingBindings.length} more installed agent${pendingBindings.length === 1 ? '' : 's'} can be switched into this conversation.`,
        )
      }

      await params.sendText(detailLines.join('\n\n'))
      return { kind: 'handled' }
    }

    const switchMatch = /^switch\s+(.+)$/i.exec(params.text)
    if (switchMatch) {
      const targetName = switchMatch[1].trim().toLowerCase()
      const activePrimary = await getPrimaryTeamsChannelForConversation(params.conversationId)
      const active = activePrimary
        ? bindings.find((binding) => binding.assistant_id === activePrimary.assistant_id)
        : bindings[0]
      const pendingBindings = params.tenantId
        ? await listPendingTeamsChannelsForTenant(params.tenantId)
        : []
      const availableAgents = [
        ...bindings,
        ...pendingBindings,
      ]
      const resolution = resolveAgentTarget({
        bindings: availableAgents,
        explicitTarget: targetName,
      })
      if (resolution.kind !== 'resolved') {
        await params.sendText(
          'I could not uniquely match that agent in this Teams conversation. Type "agents" to see the available names.',
        )
        return { kind: 'handled' }
      }
      const target = resolution.binding

      if (active?.id === target.id) {
        await params.sendText(`${target.assistant_name} is already active in this Teams conversation.`)
        return { kind: 'handled' }
      }

      const isPendingTarget = !bindings.some((binding) => binding.id === target.id)
      if (isPendingTarget) {
        const bound = await bindHostedTeamsChannel({
          conversationId: params.conversationId,
          channelId: target.id,
          serviceUrl: params.serviceUrl,
        })
        if (!bound) {
          await params.sendText('I could not switch agents right now. Please try again.')
          return { kind: 'handled' }
        }
        await params.sendText(`${target.assistant_name} is now active in this Teams conversation.`)
        return { kind: 'handled' }
      }

      const switched = await setPrimaryTeamsChannel({
        conversationId: params.conversationId,
        channelId: target.id,
      })
      if (!switched) {
        await params.sendText('I could not switch agents right now. Please try again.')
        return { kind: 'handled' }
      }

      await params.sendText(`${target.assistant_name} is now active in this conversation.`)
      return { kind: 'handled' }
    }

  if (/^leave$/i.test(params.text)) {
    const primary = await getPrimaryTeamsChannelForConversation(params.conversationId)
    if (!primary) {
      await params.sendText('No agent is active in this conversation right now. Type "agents" to inspect the installed agents.')
      return { kind: 'handled' }
    }

    const active = bindings.find((binding) => binding.assistant_id === primary.assistant_id)
    await unbindTeamsChannel(params.conversationId, primary.assistant_id)
    await params.sendText(
      active
        ? `${active.assistant_name} stepped out of this Teams conversation. Type "agents" to bring another one in.`
        : 'That agent stepped out of this Teams conversation. Type "agents" to bring another one in.',
    )
    return { kind: 'handled' }
  }

  const primary = (await getPrimaryTeamsChannelForConversation(params.conversationId)) ?? {
    id: bindings[0].id,
    assistant_id: bindings[0].assistant_id,
  }

  return {
    kind: 'route',
    channelId: primary.id,
    assistantId: primary.assistant_id,
  }
}
