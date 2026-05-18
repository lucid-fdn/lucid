import 'server-only'

import {
  parseChannelNativeCommand,
  type ChannelNativeCommand,
} from '@/lib/agent-ops/channel-native'
import { chunkChannelText } from '@/lib/channels/channel-text-chunks'
import { buildCapabilityTemplateChannelReport } from '@/lib/templates/capabilities/channel-commands'
import { globalSearch } from '@/lib/search/global-search'
import {
  createKnowledgeClaim,
  getAssistant,
  getKnowledgeClaim,
  listKnowledgeClaims,
  updateKnowledgeClaimStatus,
} from './index'
import {
  startAgentOpsRunFromChannelCommand,
  type AgentOpsChannelLaunchBinding,
} from './agent-ops-channel-launch'

export interface ChannelNativeActionInput {
  channelType: string
  channelLabel: string
  surfaceId: string
  externalUserId?: string | null
  rawCommandArg: string
  binding: AgentOpsChannelLaunchBinding
}

export async function runChannelNativeAction(input: ChannelNativeActionInput): Promise<string> {
  const parsed = parseChannelNativeCommand(input.rawCommandArg)
  if (!parsed) {
    return 'I could not parse that channel command. Try check <url>, research <topic>, plan <goal>, search <query>, remember <fact>, claims <query>, or forget <id>.'
  }

  if (parsed.kind === 'agent_ops') {
    return startAgentOpsRunFromChannelCommand({
      channelType: input.channelType,
      channelLabel: input.channelLabel,
      surfaceId: input.surfaceId,
      externalUserId: input.externalUserId,
      command: parsed.command,
      binding: input.binding,
    })
  }

  if (parsed.kind === 'capability_template') {
    return buildCapabilityTemplateChannelReport({
      command: parsed.command,
      channelLabel: input.channelLabel,
    })
  }

  const assistant = await getAssistant(input.binding.assistant_id)
  const orgId = input.binding.org_id ?? assistant?.org_id ?? null
  if (!orgId) {
    return `${input.channelLabel} command could not run because the active agent is missing an organization scope.`
  }

  return runKnowledgeChannelAction({
    command: parsed,
    orgId,
    assistantId: input.binding.assistant_id,
    channelType: input.channelType,
    surfaceId: input.surfaceId,
  })
}

export async function runChannelNativeActionChunks(
  input: ChannelNativeActionInput,
): Promise<string[]> {
  const report = await runChannelNativeAction(input)
  return chunkChannelText(report, input.channelType)
}

async function runKnowledgeChannelAction(input: {
  command: Exclude<ChannelNativeCommand, { kind: 'agent_ops' | 'capability_template' }>
  orgId: string
  assistantId: string
  channelType: string
  surfaceId: string
}): Promise<string> {
  if (input.command.kind === 'global_search') {
    const result = await globalSearch({
      orgId: input.orgId,
      query: input.command.query,
      scopes: ['all'],
      limit: 5,
    })
    const lines = result.results.slice(0, 5).map((item, index) =>
      `${index + 1}. ${item.title}${item.subtitle ? ` - ${item.subtitle}` : ''}`,
    )
    return [
      `Global Search: ${input.command.query}`,
      lines.length > 0 ? lines.join('\n') : 'No results found.',
    ].join('\n')
  }

  if (input.command.kind === 'knowledge_claims') {
    const claims = await listKnowledgeClaims({
      orgId: input.orgId,
      query: input.command.query,
      status: 'active',
      limit: 5,
    })
    const lines = claims.map((claim, index) =>
      `${index + 1}. ${claim.subject}: ${claim.claim} (${Math.round(claim.confidence * 100)}%)`,
    )
    return [
      `Knowledge claims${input.command.query ? ` for "${input.command.query}"` : ''}`,
      lines.length > 0 ? lines.join('\n') : 'No active claims found.',
    ].join('\n')
  }

  if (input.command.kind === 'knowledge_forget') {
    const claim = await getKnowledgeClaim(input.orgId, input.command.id)
    if (!claim) {
      return `No Knowledge claim found for ${input.command.id}.`
    }
    const archived = await updateKnowledgeClaimStatus({
      orgId: input.orgId,
      claimId: input.command.id,
      status: 'archived',
      summary: `Knowledge claim archived from ${input.channelType} forget command.`,
    })
    return `Forgot Knowledge claim: ${archived.subject}`
  }

  const claim = await createKnowledgeClaim({
    orgId: input.orgId,
    projectId: null,
    teamId: null,
    assistantId: input.assistantId,
    sourceId: null,
    pageId: null,
    claimType: 'claim',
    subject: input.command.text.slice(0, 160),
    claim: input.command.text,
    holderType: 'agent',
    holderId: input.assistantId,
    confidence: 0.7,
    weight: 0.5,
    status: 'active',
    evidence: [{
      kind: 'channel_event',
      messageId: `${input.channelType}:${input.surfaceId}`,
      label: `remember command from ${input.channelType}`,
    }],
    metadata: {
      source: 'channel_native_remember',
      channel_type: input.channelType,
      surface_id: input.surfaceId,
    },
    createdByAgentId: input.assistantId,
  })

  return `Remembered as Knowledge claim: ${claim.subject}`
}
