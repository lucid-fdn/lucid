import 'server-only'

import { buildAgentOpsRunSystemNotice, startAgentOpsRun } from '@/lib/agent-ops'
import {
  buildAgentOpsChannelScope,
  formatAgentOpsChannelLaunchReport,
  type AgentOpsChannelCommand,
} from '@/lib/agent-ops/channel-native'
import {
  appendAgentOpsRunLink,
  recordAgentOpsProjectTimelineEvent,
  supabaseAgentOpsRunModeRecorder,
  supabaseAgentOpsRunStore,
  updateAgentOpsRunMetadata,
} from './agent-ops'
import { supabaseAgentOpsDagOrchestrationAdapter } from './agent-ops-orchestration'
import { supabaseAgentOpsSpecialistTelemetryProvider } from './agent-ops-product'
import { supabaseAgentOpsRuntimeSelector } from './agent-ops-runtime-selector'
import { supabaseAgentOpsTeamPolicyGate } from './agent-ops-team-policy-gate'
import { createSystemNotice, getAssistant } from './index'

export interface AgentOpsChannelLaunchBinding {
  assistant_id: string
  org_id?: string | null
  assistant_name?: string | null
}

export interface StartAgentOpsRunFromChannelInput {
  channelType: 'discord' | 'telegram' | 'whatsapp' | 'slack' | string
  channelLabel: string
  surfaceId: string
  externalUserId?: string | null
  command: AgentOpsChannelCommand
  binding: AgentOpsChannelLaunchBinding
}

export async function startAgentOpsRunFromChannelCommand(
  input: StartAgentOpsRunFromChannelInput,
): Promise<string> {
  const assistant = await getAssistant(input.binding.assistant_id)
  const orgId = input.binding.org_id ?? assistant?.org_id ?? null
  if (!orgId) {
    return `${input.channelLabel} Agent Ops could not start because the active agent is missing an organization scope.`
  }

  const scope = buildAgentOpsChannelScope({
    channelType: input.channelType,
    surfaceId: input.surfaceId,
    target: input.command.target,
  })
  const run = await startAgentOpsRun(
    {
      orgId,
      projectId: assistant?.project_id ?? null,
      assistantId: input.binding.assistant_id,
      requestedByUserId: null,
      workflowId: input.command.workflowId,
      runMode: input.command.runMode ?? 'execute',
      scope,
      input: {
        target: input.command.target ?? scope.ref,
        channel_type: input.channelType,
        channel_surface_id: input.surfaceId,
        channel_command_intent: input.command.intent ?? 'agent_ops',
      },
      metadata: {
        launched_from: `${input.channelType}_command`,
        channel: {
          type: input.channelType,
          surface_id: input.surfaceId,
          external_user_id: input.externalUserId ?? null,
        },
      },
    },
    {
      runStore: supabaseAgentOpsRunStore,
      teamPolicyGate: supabaseAgentOpsTeamPolicyGate,
      specialistTelemetry: supabaseAgentOpsSpecialistTelemetryProvider,
      runtimeSelector: supabaseAgentOpsRuntimeSelector,
      runModeRecorder: supabaseAgentOpsRunModeRecorder,
      orchestration: supabaseAgentOpsDagOrchestrationAdapter,
    },
  )
  const runWithChannelStatus = await updateAgentOpsRunMetadata({
    orgId: run.orgId,
    runId: run.id,
    metadata: buildChannelLaunchMetadata({ input, run }),
  })

  await Promise.all([
    createChannelLaunchNotice(runWithChannelStatus),
    appendAgentOpsRunLink({
      orgId,
      runId: run.id,
      linkType: 'external',
      refText: `${input.channelType}:${input.surfaceId}`,
      label: `${input.channelLabel} channel`,
      metadata: {
        source: `${input.channelType}_command`,
        scope_type: scope.type,
        workflow_id: input.command.workflowId,
      },
    }).catch(() => null),
    assistant?.project_id
      ? recordAgentOpsProjectTimelineEvent({
          orgId,
          projectId: assistant.project_id,
          runId: run.id,
          eventType: 'agent_ops_run_started',
          title: `${input.command.workflowId} Agent Ops run started from ${input.channelLabel}`,
          body: scope.label,
          evidence: {
            workflow_id: input.command.workflowId,
            scope_type: scope.type,
            scope_ref: scope.ref,
          },
          metadata: {
            source: `${input.channelType}_command`,
            channel_type: input.channelType,
          },
          createdBy: null,
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  return formatAgentOpsChannelLaunchReport({ run: runWithChannelStatus, channelLabel: input.channelLabel })
}

async function createChannelLaunchNotice(run: Awaited<ReturnType<typeof startAgentOpsRun>>) {
  const notice = buildAgentOpsRunSystemNotice(run)
  if (!notice) return null
  return createSystemNotice(notice).catch(() => null)
}

function buildChannelLaunchMetadata(input: {
  input: StartAgentOpsRunFromChannelInput
  run: Awaited<ReturnType<typeof startAgentOpsRun>>
}): Record<string, unknown> {
  const teamOps = readRecord(input.run.metadata.team_ops)
  const channelLaunchStatus = readRecord(teamOps.channelLaunchStatus)
  const channelType = input.input.channelType

  return {
    ...input.run.metadata,
    team_ops: {
      ...teamOps,
      channelLaunchStatus: {
        ...channelLaunchStatus,
        [channelType]: {
          channelType,
          channelLabel: input.input.channelLabel,
          surfaceId: input.input.surfaceId,
          externalUserId: input.input.externalUserId ?? null,
          workflowId: input.input.command.workflowId,
          runMode: input.input.command.runMode ?? 'execute',
          intent: input.input.command.intent ?? 'agent_ops',
          target: input.input.command.target ?? null,
          status: input.run.status === 'blocked' ? 'blocked' : 'started',
          reportStatus: 'ready',
          reportMode: 'channel_response',
          launchedFrom: `${channelType}_command`,
          launchedAt: new Date().toISOString(),
        },
      },
    },
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
