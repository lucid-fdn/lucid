/**
 * Mission Control — DB Query Layer (Server-only)
 */

import 'server-only'
import { createHash } from 'crypto'
import { supabase, ErrorService, isTransientSupabaseError } from './client'
import { promoteNativeSkillCandidate } from './skills'
import type {
  AgentEngine,
  ChannelOwnership,
  RuntimeFlavor,
  RuntimeProtocol,
} from '@/lib/engines/types'
import type { DedicatedTransportMode } from '@lucid/runtime-compat'
import type { RuntimeBootstrapConfig } from '@/lib/runtimes/bootstrap'
import type { RuntimeMigrationConfig } from '@/lib/runtimes/migration'
import type {
  RuntimeAdapterIdentity,
  RuntimeAdapterProbeSummary,
  RuntimeCommandSpec,
  RuntimeEngineHomePolicy,
  RuntimeManagementCommand,
  RuntimeManagementCommandStatus,
  RuntimeNativeCapability,
  RuntimeServiceDescriptor,
  RuntimeTranscriptParserStatus,
} from '@contracts/runtime-capability'
import { resolveDedicatedTransportMode } from '@/lib/runtimes/dedicated-transport'
import { deriveRuntimePresenceStatus, getRuntimePresenceThresholds } from '@/lib/runtimes/policy'
import {
  resolveTelegramIngress,
  type TelegramInboundAttachmentRef,
} from '@/lib/telegram/inbound-media'
import { decryptChannelSecrets } from '@/lib/channels/secrets'
import { getMediaProviderConfig } from '@/lib/ai/media-provider-config'
import { buildProjectLearningPromptContext } from '@/lib/agent-ops/project-learning-context'
import { buildScopedUserId } from '@/lib/memory/tenant-keys'
import {
  buildScheduledTaskDefinitionSnapshot,
  buildScheduledTaskRestorePatch,
  buildScheduledTaskSnapshotHash,
} from '@/lib/mission-control/scheduled-task-versions'
import {
  getWorkspaceAttentionData,
  type WorkspaceAttentionApproval,
  type WorkspaceAttentionData,
  type WorkspaceAttentionFailure,
  type WorkspaceAttentionProject,
  type WorkspaceAttentionWorkItem,
} from '@/lib/workspace/attention'
import type {
  MCAgent,
  MCAgentContext,
  FeedEvent,
  PendingApproval,
  ApprovalAction,
  AgentStatus,
  DedicatedRuntime,
  RuntimeMaintenanceAction,
  RuntimeMaintenanceJob,
  RuntimeMaintenanceJobStatus,
  RuntimeMaintenanceState,
  ScheduledTask,
  ScheduledTaskVersion,
  ScheduledTaskVersionChangeType,
  LinearAgentSession,
} from '@/lib/mission-control/types'

function mapChannelModeToOwnership(
  channelMode: DedicatedRuntime['channelMode'] | null
): ChannelOwnership | null {
  if (channelMode === 'native') return 'runtime_native'
  if (channelMode === 'relay') return 'lucid_relay'
  return null
}

function mapOwnershipToChannelMode(
  channelOwnership: ChannelOwnership | null | undefined
): DedicatedRuntime['channelMode'] | null {
  if (channelOwnership === 'runtime_native') return 'native'
  if (channelOwnership === 'lucid_relay') return 'relay'
  return null
}

function mapRuntimeFlavor(
  runtimeFlavor: RuntimeFlavor | null | undefined,
  channelMode: DedicatedRuntime['channelMode'] | null
): Exclude<RuntimeFlavor, 'shared'> {
  if (runtimeFlavor === 'c1_managed' || runtimeFlavor === 'c2a_autonomous') {
    return runtimeFlavor
  }
  return channelMode === 'native' ? 'c2a_autonomous' : 'c1_managed'
}

function mapDedicatedRuntimeRow(row: Record<string, unknown>): DedicatedRuntime {
  const channelMode = (row.channel_mode as DedicatedRuntime['channelMode']) ?? null
  const dedicatedTransportMode = resolveDedicatedTransportMode({
    dedicatedTransportMode:
      (row.dedicated_transport_mode as DedicatedTransportMode | null | undefined) ?? null,
    channelMode,
    channelOwnership: (row.channel_ownership as ChannelOwnership | null | undefined) ?? null,
  })
  const runtimeFlavor = mapRuntimeFlavor(
    (row.runtime_flavor as RuntimeFlavor | null | undefined) ?? null,
    channelMode,
  )
  const engineMetadata =
    (row.engine_metadata as Record<string, unknown> | null | undefined) ?? null
  const runtimeBootstrapConfig =
    ((row.runtime_bootstrap_config as RuntimeBootstrapConfig | null | undefined) ??
      ((engineMetadata?.migration
        ? { migration: engineMetadata.migration as RuntimeMigrationConfig }
        : null) as RuntimeBootstrapConfig | null)) ?? null

  return {
    id: row.id as string,
    orgId: row.org_id as string,
    displayName: row.display_name as string,
    description: row.description as string | null,
    provider: row.provider as DedicatedRuntime['provider'],
    status: row.status as DedicatedRuntime['status'],
    runtimeTier: (row.runtime_tier as DedicatedRuntime['runtimeTier']) ?? null,
    engine: (row.engine as AgentEngine | null) ?? 'openclaw',
    runtimeFlavor,
    channelOwnership:
      (row.channel_ownership as ChannelOwnership | null | undefined) ??
      mapChannelModeToOwnership(channelMode),
    runtimeProtocol: (row.runtime_protocol as RuntimeProtocol | null) ?? 'lucid-runtime-v1',
    engineVersion: (row.engine_version as string | null | undefined) ?? null,
    runtimeVersion: (row.runtime_version as string | null | undefined) ?? null,
    lastSeenAt: row.last_seen_at as string | null,
    openclawVersion: (row.openclaw_version as string | null | undefined) ?? null,
    cpuPercent: row.cpu_percent != null ? Number(row.cpu_percent) : null,
    ramPercent: row.ram_percent != null ? Number(row.ram_percent) : null,
    diskPercent: row.disk_percent != null ? Number(row.disk_percent) : null,
    gpuPercent: row.gpu_percent != null ? Number(row.gpu_percent) : null,
    workerPendingEvents: Number(row.worker_pending_events || 0),
    workerDeadLetters: Number(row.worker_dead_letters || 0),
    agentCount: Number(row.agent_count || 0),
    deploymentUrl: (row.deployment_url as string | null | undefined) ?? null,
    l2DeploymentId: (row.l2_deployment_id as string | null | undefined) ?? null,
    l2PassportId: (row.l2_passport_id as string | null | undefined) ?? null,
    l2PassportOwner: (row.l2_passport_owner as string | null | undefined) ?? null,
    l2OwnerMode:
      (row.l2_owner_mode as DedicatedRuntime['l2OwnerMode'] | null | undefined) ?? null,
    l2ClaimStatus:
      (row.l2_claim_status as DedicatedRuntime['l2ClaimStatus'] | null | undefined) ?? null,
    l2ClaimedByUserId: (row.l2_claimed_by_user_id as string | null | undefined) ?? null,
    l2ClaimedAt: (row.l2_claimed_at as string | null | undefined) ?? null,
    lastL2Status: (row.last_l2_status as string | null | undefined) ?? null,
    lastL2Error: (row.last_l2_error as string | null | undefined) ?? null,
    lastL2CheckedAt: (row.last_l2_checked_at as string | null | undefined) ?? null,
    managedByLucid: Boolean(row.managed_by_lucid),
    maintenanceChannel:
      (row.maintenance_channel as DedicatedRuntime['maintenanceChannel'] | null | undefined) ??
      'stable',
    autoUpdatePolicy:
      (row.auto_update_policy as DedicatedRuntime['autoUpdatePolicy'] | null | undefined) ??
      'manual',
    currentImageRef: (row.current_image_ref as string | null | undefined) ?? null,
    currentImageDigest: (row.current_image_digest as string | null | undefined) ?? null,
    targetImageRef: (row.target_image_ref as string | null | undefined) ?? null,
    lastSuccessfulImageRef:
      (row.last_successful_image_ref as string | null | undefined) ?? null,
    lastMaintenanceAction:
      (row.last_maintenance_action as DedicatedRuntime['lastMaintenanceAction'] | null | undefined) ?? null,
    lastMaintenanceAt: (row.last_maintenance_at as string | null | undefined) ?? null,
    lastMaintenanceError: (row.last_maintenance_error as string | null | undefined) ?? null,
    pendingAgentName: (row.pending_agent_name as string | null | undefined) ?? null,
    pendingAgentUserId: (row.pending_agent_user_id as string | null | undefined) ?? null,
    pendingAgentConfig:
      (row.pending_agent_config as Record<string, unknown> | null | undefined) ?? null,
    createdAssistantId: (row.created_assistant_id as string | null | undefined) ?? null,
    intentStatus: (row.intent_status as DedicatedRuntime['intentStatus'] | null | undefined) ?? null,
    intentError: (row.intent_error as string | null | undefined) ?? null,
    intentFulfilledAt: (row.intent_fulfilled_at as string | null | undefined) ?? null,
    envSnapshot:
      (row.env_snapshot as DedicatedRuntime['envSnapshot'] | null | undefined) ?? null,
    healthcheckConfig:
      (row.healthcheck_config as DedicatedRuntime['healthcheckConfig'] | null | undefined) ?? null,
    restartPolicy:
      (row.restart_policy as DedicatedRuntime['restartPolicy'] | null | undefined) ?? null,
    channelMode,
    dedicatedTransportMode,
    nativeChannels: (row.native_channels as DedicatedRuntime['nativeChannels'] | null | undefined) ?? null,
    pendingActions: (row.pending_actions as DedicatedRuntime['pendingActions'] | null | undefined) ?? null,
    systemInfo: (row.system_info as DedicatedRuntime['systemInfo'] | null | undefined) ?? null,
    adapterIdentity:
      (row.adapter_identity as RuntimeAdapterIdentity | null | undefined) ?? null,
    nativeCapabilities:
      (row.native_capabilities as RuntimeNativeCapability[] | null | undefined) ?? [],
    runtimeServices:
      (row.runtime_services as RuntimeServiceDescriptor[] | null | undefined) ?? [],
    adapterProbe:
      (row.adapter_probe_result as RuntimeAdapterProbeSummary | null | undefined) ?? null,
    transcriptParser:
      (row.transcript_parser_status as RuntimeTranscriptParserStatus | null | undefined) ?? null,
    commandSpec:
      (row.runtime_command_spec as RuntimeCommandSpec | null | undefined) ?? null,
    engineHomePolicy:
      (row.engine_home_policy as RuntimeEngineHomePolicy | null | undefined) ?? null,
    capabilityReportedAt:
      (row.capability_reported_at as string | null | undefined) ?? null,
    engineMetadata,
    runtimeBootstrapConfig,
    migrationConfig:
      (runtimeBootstrapConfig?.migration as RuntimeMigrationConfig | null | undefined) ?? null,
    createdAt: row.created_at as string,
  }
}

function mapRuntimeMaintenanceJobRow(row: Record<string, unknown>): RuntimeMaintenanceJob {
  return {
    id: row.id as string,
    runtimeId: row.runtime_id as string,
    orgId: row.org_id as string,
    provider: row.provider as string,
    action: row.action as RuntimeMaintenanceAction,
    status: row.status as RuntimeMaintenanceJobStatus,
    targetImageRef: (row.target_image_ref as string | null | undefined) ?? null,
    targetImageDigest: (row.target_image_digest as string | null | undefined) ?? null,
    providerOperationId: (row.provider_operation_id as string | null | undefined) ?? null,
    providerDeploymentId: (row.provider_deployment_id as string | null | undefined) ?? null,
    requestedBy: (row.requested_by as string | null | undefined) ?? null,
    resultPayload:
      (row.result_payload as Record<string, unknown> | null | undefined) ?? {},
    error: (row.error as string | null | undefined) ?? null,
    startedAt: (row.started_at as string | null | undefined) ?? null,
    completedAt: (row.completed_at as string | null | undefined) ?? null,
    createdAt: row.created_at as string,
  }
}

function mapRuntimeManagementCommandRow(row: Record<string, unknown>): RuntimeManagementCommand {
  return {
    id: row.id as string,
    runtimeId: row.runtime_id as string,
    orgId: row.org_id as string,
    commandType: row.command_type as string,
    targetCapabilityId: (row.target_capability_id as string | null | undefined) ?? null,
    payload: (row.payload as Record<string, unknown> | null | undefined) ?? {},
    status: row.status as RuntimeManagementCommandStatus,
    response: (row.response as Record<string, unknown> | null | undefined) ?? null,
    error: (row.error as string | null | undefined) ?? null,
    requestedBy: (row.requested_by as string | null | undefined) ?? null,
    requestedAt: row.requested_at as string,
    dispatchedAt: (row.dispatched_at as string | null | undefined) ?? null,
    acknowledgedAt: (row.acknowledged_at as string | null | undefined) ?? null,
    expiresAt: (row.expires_at as string | null | undefined) ?? null,
  }
}

const DEDICATED_RUNTIME_SELECT = `
  adapter_identity,
  adapter_probe_result,
  agent_count,
  auto_update_policy,
  capability_reported_at,
  channel_mode,
  channel_ownership,
  cpu_percent,
  created_assistant_id,
  created_at,
  current_image_digest,
  current_image_ref,
  dedicated_transport_mode,
  deployment_url,
  description,
  disk_percent,
  display_name,
  engine,
  engine_home_policy,
  engine_metadata,
  engine_version,
  env_snapshot,
  gpu_percent,
  healthcheck_config,
  id,
  intent_error,
  intent_fulfilled_at,
  intent_status,
  l2_claim_status,
  l2_claimed_at,
  l2_claimed_by_user_id,
  l2_deployment_id,
  l2_owner_mode,
  l2_passport_id,
  l2_passport_owner,
  last_l2_checked_at,
  last_l2_error,
  last_l2_status,
  last_maintenance_action,
  last_maintenance_at,
  last_maintenance_error,
  last_seen_at,
  last_successful_image_ref,
  maintenance_channel,
  managed_by_lucid,
  native_capabilities,
  native_channels,
  openclaw_version,
  org_id,
  pending_actions,
  pending_agent_config,
  pending_agent_name,
  pending_agent_user_id,
  provider,
  ram_percent,
  restart_policy,
  runtime_bootstrap_config,
  runtime_command_spec,
  runtime_flavor,
  runtime_protocol,
  runtime_services,
  runtime_tier,
  runtime_version,
  status,
  system_info,
  target_image_ref,
  transcript_parser_status,
  worker_dead_letters,
  worker_pending_events
` as const

const OPTIONAL_DEDICATED_RUNTIME_COLUMNS = new Set([
  'native_channels',
  'pending_actions',
])

type RuntimeSelectError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

type RuntimeSelectResult<T> = {
  data: T | null
  error: RuntimeSelectError | null
}

function buildDedicatedRuntimeSelect(omittedColumns: Set<string>): string {
  if (omittedColumns.size === 0) return DEDICATED_RUNTIME_SELECT

  return DEDICATED_RUNTIME_SELECT
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((column) => column.replace(/,$/, ''))
    .filter((column) => !omittedColumns.has(column))
    .map((column, index, columns) => `${column}${index === columns.length - 1 ? '' : ','}`)
    .join('\n')
}

function getMissingOptionalRuntimeColumn(error: RuntimeSelectError | null): string | null {
  if (!error) return null

  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  const missingColumn = text.match(/column\s+dedicated_runtimes\.([a-z_]+)\s+does\s+not\s+exist/i)?.[1]

  return missingColumn && OPTIONAL_DEDICATED_RUNTIME_COLUMNS.has(missingColumn)
    ? missingColumn
    : null
}

async function runDedicatedRuntimeSelect<T>(
  buildQuery: (select: string) => PromiseLike<RuntimeSelectResult<T>>,
): Promise<RuntimeSelectResult<T>> {
  const omittedColumns = new Set<string>()
  let lastError: RuntimeSelectError | null = null

  for (let attempt = 0; attempt <= OPTIONAL_DEDICATED_RUNTIME_COLUMNS.size; attempt += 1) {
    const result = await buildQuery(buildDedicatedRuntimeSelect(omittedColumns))
    if (!result.error) return result

    lastError = result.error
    const missingColumn = getMissingOptionalRuntimeColumn(result.error)
    if (!missingColumn || omittedColumns.has(missingColumn)) {
      return result
    }

    omittedColumns.add(missingColumn)
  }

  return { data: null, error: lastError }
}

const RUNTIME_MAINTENANCE_JOB_SELECT = `
  action,
  completed_at,
  created_at,
  error,
  id,
  org_id,
  provider,
  provider_deployment_id,
  provider_operation_id,
  requested_by,
  result_payload,
  runtime_id,
  started_at,
  status,
  target_image_digest,
  target_image_ref
` as const

const RUNTIME_MANAGEMENT_COMMAND_SELECT = `
  acknowledged_at,
  command_type,
  dispatched_at,
  error,
  expires_at,
  id,
  org_id,
  payload,
  requested_at,
  requested_by,
  response,
  runtime_id,
  status,
  target_capability_id
` as const

const NATIVE_MUTATION_CANDIDATE_SELECT = `
  id,
  agent_id,
  org_id,
  runtime_id,
  run_id,
  source,
  engine,
  runtime_flavor,
  mutation_kind,
  tool_name,
  tool_args,
  reason,
  status,
  promotion_scope,
  review_notes,
  reviewed_by,
  reviewed_at,
  review_attempts,
  last_error,
  last_error_at,
  applied_record_id,
  applied_at,
  created_at
` as const

const RELAY_INBOUND_EVENT_SELECT = `
  id,
  channel_id,
  external_user_id,
  external_chat_id,
  external_message_id,
  message_text,
  message_data
` as const

// ─── Agent List ───

export async function getMCAgentList(orgId: string): Promise<MCAgent[]> {
  // Use mc_agent_fleet RPC which includes health score + cost data
  const { data, error } = await supabase.rpc('mc_agent_fleet', {
    p_org_id: orgId,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'mc_agent_fleet', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  const agents = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    status: (row.mc_status || 'active') as AgentStatus,
    lucid_model: row.lucid_model as string,
    is_active: (row.mc_status || 'active') === 'active',
    org_id: orgId,
    approval_required_tools: (row.approval_required_tools || []) as string[],
    cost_today_usd: Number(row.cost_today_usd || 0),
    errors_last_hour: Number(row.errors_last_hour || 0),
    last_active_at: row.last_active_at as string | null,
    risk_level: computeRiskLevel(Number(row.errors_last_hour || 0)),
    pending_approvals: Number(row.pending_approvals || 0),
    health_score: row.health_score != null ? Number(row.health_score) : null,
    runtime: row.runtime_id
      ? {
          runtimeId: row.runtime_id as string,
          runtimeName: row.runtime_name as string | null,
          runtimeStatus: row.runtime_status as string | null,
          runtimeProvider: row.runtime_provider as string | null,
        }
      : undefined,
  }))

  if (agents.length === 0) return agents

  const assistantIds = agents.map((agent: MCAgent) => agent.id)
  const { data: assistantRows, error: assistantRowsError } = await supabase
    .from('ai_assistants')
    .select('id, project_id')
    .in('id', assistantIds)

  if (assistantRowsError) {
    ErrorService.captureException(assistantRowsError, {
      severity: 'warning',
      context: { endpoint: 'mc_agent_fleet', orgId, step: 'loadProjectIds' },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return agents
  }

  const projectIds = Array.from(
    new Set(
      (assistantRows || [])
        .map((row) => row.project_id)
        .filter((projectId): projectId is string => typeof projectId === 'string' && projectId.length > 0),
    ),
  )

  if (projectIds.length === 0) {
    return agents.map((agent: MCAgent) => ({
      ...agent,
      projectSlug: null,
    }))
  }

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, slug, name')
    .in('id', projectIds)

  if (projectsError) {
    ErrorService.captureException(projectsError, {
      severity: 'warning',
      context: { endpoint: 'mc_agent_fleet', orgId, step: 'loadProjectSlugs' },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return agents
  }

  const projectIdByAssistantId = new Map(
    (assistantRows || []).map((row) => [row.id as string, row.project_id as string | null]),
  )
  const projectSlugById = new Map(
    (projects || []).map((project) => [project.id as string, project.slug as string]),
  )
  const projectNameById = new Map(
    (projects || []).map((project) => [project.id as string, project.name as string]),
  )

  return agents.map((agent: MCAgent) => ({
    ...agent,
    ...(() => {
      const projectId = projectIdByAssistantId.get(agent.id)
      return {
        projectSlug: projectId ? (projectSlugById.get(projectId) ?? null) : null,
        projectName: projectId ? (projectNameById.get(projectId) ?? null) : null,
      }
    })(),
  }))
}

function computeRiskLevel(errorsLastHour: number): MCAgent['risk_level'] {
  if (errorsLastHour >= 10) return 'critical'
  if (errorsLastHour >= 5) return 'high'
  if (errorsLastHour >= 2) return 'medium'
  return 'low'
}

// ─── Feed Events ───

export async function getMCFeedEvents(
  orgId: string,
  options?: { limit?: number; agentId?: string; cursor?: string }
): Promise<FeedEvent[]> {
  const { data, error } = await supabase.rpc('mc_feed_events', {
    p_org_id: orgId,
    p_limit: options?.limit ?? 50,
    p_agent_id: options?.agentId ?? null,
    p_cursor: options?.cursor ?? null,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: isTransientSupabaseError(error) ? 'warning' : 'error',
      context: { endpoint: 'mc_feed_events', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data || []) as FeedEvent[]
}

export interface RuntimeAttachedAgent {
  id: string
  name: string
  projectId: string | null
  projectSlug: string | null
  projectName: string | null
  mcStatus: AgentStatus
}

export async function getRuntimeAttachedAgents(
  runtimeId: string,
  orgId: string,
): Promise<RuntimeAttachedAgent[]> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select('id, name, mc_status, project_id')
    .eq('org_id', orgId)
    .eq('runtime_id', runtimeId)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getRuntimeAttachedAgents', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  const projectIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.project_id)
        .filter((projectId): projectId is string => typeof projectId === 'string' && projectId.length > 0),
    ),
  )

  const projectMap = new Map<string, { slug: string; name: string }>()

  if (projectIds.length > 0) {
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name')
      .in('id', projectIds)

    if (projectsError) {
      ErrorService.captureException(projectsError, {
        severity: 'warning',
        context: { endpoint: 'getRuntimeAttachedAgents', runtimeId, orgId, step: 'loadProjects' },
        tags: { layer: 'db', route: 'mission-control' },
      })
    } else {
      for (const project of projects ?? []) {
        projectMap.set(project.id as string, {
          slug: project.slug as string,
          name: project.name as string,
        })
      }
    }
  }

  return (data ?? []).map((row) => {
    const project = typeof row.project_id === 'string' ? projectMap.get(row.project_id) : null
    return {
      id: row.id as string,
      name: row.name as string,
      projectId: (row.project_id as string | null | undefined) ?? null,
      projectSlug: project?.slug ?? null,
      projectName: project?.name ?? null,
      mcStatus: ((row.mc_status as AgentStatus | null | undefined) ?? 'active'),
    }
  })
}

// ─── Agent Context ───

export async function getMCAgentContext(
  agentId: string,
  orgId: string
): Promise<MCAgentContext | null> {
  const { data, error } = await supabase.rpc('mc_agent_context', {
    p_agent_id: agentId,
    p_org_id: orgId,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'mc_agent_context', agentId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return data as MCAgentContext | null
}

// ─── Approvals ───

export async function getPendingApprovals(orgId: string): Promise<PendingApproval[]> {
  const { data, error } = await supabase
    .from('mc_pending_approvals')
    .select(`
      id, org_id, agent_id, run_id,
      tool_name, tool_args,
      estimated_cost_usd, risk_level,
      status, requested_at, expires_at,
      ai_assistants!inner(name)
    `)
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: isTransientSupabaseError(error) ? 'warning' : 'error',
      context: { endpoint: 'getPendingApprovals', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    org_id: row.org_id as string,
    agent_id: row.agent_id as string,
    agent_name: (row.ai_assistants as Record<string, string>)?.name ?? 'Unknown',
    run_id: row.run_id as string,
    tool_name: row.tool_name as string,
    tool_args: row.tool_args as Record<string, unknown>,
    estimated_cost_usd: row.estimated_cost_usd as number | null,
    risk_level: row.risk_level as PendingApproval['risk_level'],
    status: row.status as PendingApproval['status'],
    requested_at: row.requested_at as string,
    expires_at: row.expires_at as string,
  }))
}

export async function resolveApproval(
  approvalId: string,
  orgId: string,
  userId: string,
  action: ApprovalAction
): Promise<{ success: boolean; error?: string }> {
  // Update the pending approval
  const { error: updateError } = await supabase
    .from('mc_pending_approvals')
    .update({
      status: action.action,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', approvalId)
    .eq('org_id', orgId)
    .eq('status', 'pending')

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: { endpoint: 'resolveApproval', approvalId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: updateError.message }
  }

  // Log the action
  const { error: logError } = await supabase
    .from('mc_approval_log')
    .insert({
      approval_id: approvalId,
      org_id: orgId,
      action: action.action,
      resolved_by: userId,
      reason: action.reason ?? null,
    })

  if (logError) {
    ErrorService.captureException(logError, {
      severity: 'warning',
      context: { endpoint: 'resolveApproval:log', approvalId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }

  // Phase 6 — Bidirectional approval bridge: if a human_work_items row
  // mirrors this approval, complete it. Guard: only matches 'open' items
  // to prevent infinite loops (second writer matches 0 rows).
  try {
    const { data: mirror } = await supabase
      .from('human_work_items')
      .select('id')
      .filter('external_mirror->>approval_id', 'eq', approvalId)
      .in('status', ['open', 'in_progress'])
      .maybeSingle()
    if (mirror?.id) {
      const resolution = action.action === 'approved' ? 'approved' : 'rejected'
      const nextStatus = resolution === 'rejected' ? 'rejected' : 'done'
      await supabase
        .from('human_work_items')
        .update({
          status: nextStatus,
          resolution,
          resolution_notes: action.reason ?? `Resolved via Mission Control`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', mirror.id)
        .in('status', ['open', 'in_progress'])
    }
  } catch {
    // Best-effort — approval resolution is not blocked by mirror failure.
  }

  return { success: true }
}

// ─── Agent Controls ───

/**
 * Transition an agent's status with state machine validation.
 *
 * Valid transitions:
 *   active  → paused, stopped, failed
 *   paused  → active, stopped
 *   stopped → active
 *   failed  → active, stopped
 */
const VALID_AGENT_TRANSITIONS: Record<string, string[]> = {
  active:  ['paused', 'stopped', 'failed'],
  paused:  ['active', 'stopped'],
  stopped: ['active'],
  failed:  ['active', 'stopped'],
}

export async function updateAgentStatus(
  agentId: string,
  orgId: string,
  status: AgentStatus,
  actor: 'user' | 'system' = 'user',
): Promise<{ success: boolean; error?: string; previousStatus?: string }> {
  // 1. Read current status + runtime_id for wake signal
  const { data: agent, error: fetchError } = await supabase
    .from('ai_assistants')
    .select('mc_status, name, runtime_id')
    .eq('id', agentId)
    .eq('org_id', orgId)
    .single()

  if (fetchError || !agent) {
    ErrorService.captureException(fetchError ?? new Error('Agent not found'), {
      severity: 'error',
      context: { endpoint: 'updateAgentStatus', agentId, status },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: fetchError?.message || 'Agent not found' }
  }

  const currentStatus = (agent.mc_status || 'active') as string

  // No-op if already in target state
  if (currentStatus === status) {
    return { success: true, previousStatus: currentStatus }
  }

  // 2. Validate transition
  const allowed = VALID_AGENT_TRANSITIONS[currentStatus]
  if (!allowed || !allowed.includes(status)) {
    return {
      success: false,
      error: `Invalid transition: ${currentStatus} → ${status}`,
      previousStatus: currentStatus,
    }
  }

  // 3. Update with optimistic lock (only if still in expected state)
  const { error } = await supabase
    .from('ai_assistants')
    .update({ mc_status: status })
    .eq('id', agentId)
    .eq('org_id', orgId)
    .eq('mc_status', currentStatus)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'updateAgentStatus', agentId, status },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: error.message, previousStatus: currentStatus }
  }

  // 4. Emit audit event (best-effort)
  const eventType = status === 'active' ? 'agent_resumed' : `agent_${status}`
  await supabase.from('runtime_events').insert({
    runtime_id: null,
    org_id: orgId,
    agent_id: agentId,
    event_type: eventType,
    severity: status === 'failed' ? 'error' : 'info',
    payload: {
      type: 'status_transition',
      agentName: agent.name || 'Unknown',
      from: currentStatus,
      to: status,
      actor,
    },
  }).then(({ error: evtErr }) => {
    if (evtErr) {
      console.warn(`[updateAgentStatus] Failed to emit event:`, evtErr.message)
    }
  })

  // 5. Wake the dedicated runtime immediately (don't wait for 30s heartbeat)
  if (agent.runtime_id) {
    import('@/lib/realtime/broadcast').then(({ publishRuntimeWake }) => {
      publishRuntimeWake(agent.runtime_id as string, 'governance')
    }).catch(() => {})
  }

  return { success: true, previousStatus: currentStatus }
}

// ─── Nudge ───

/**
 * Nudge an agent by inserting a synthetic inbound event.
 * Ensures an agent channel exists, inserts a pending event, and wakes the runtime.
 */
export async function nudgeAgent(
  agentId: string,
  orgId: string,
  message?: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Verify agent exists and belongs to org
  const { data: agent, error: fetchError } = await supabase
    .from('ai_assistants')
    .select('id, name, mc_status, runtime_id')
    .eq('id', agentId)
    .eq('org_id', orgId)
    .single()

  if (fetchError || !agent) {
    return { success: false, error: 'Agent not found' }
  }

  if (agent.mc_status === 'paused') {
    return { success: false, error: 'Agent is paused. Resume it first.' }
  }

  // 2. Ensure agent channel exists (upsert pattern — matches crew-run-orchestration)
  let channelId: string
  const { data: existing } = await supabase
    .from('assistant_channels')
    .select('id')
    .eq('assistant_id', agentId)
    .eq('channel_type', 'agent')
    .eq('is_active', true)
    .single()

  if (existing) {
    channelId = existing.id
  } else {
    const { data: created, error: createErr } = await supabase
      .from('assistant_channels')
      .insert({
        assistant_id: agentId,
        channel_type: 'agent',
        external_channel_id: `agent-internal:${agentId}`,
      })
      .select('id')
      .single()

    if (createErr) {
      // Race: another call created it
      if (createErr.code === '23505') {
        const { data: retry } = await supabase
          .from('assistant_channels')
          .select('id')
          .eq('assistant_id', agentId)
          .eq('channel_type', 'agent')
          .eq('is_active', true)
          .single()
        if (retry) {
          channelId = retry.id
        } else {
          return { success: false, error: 'Failed to provision agent channel' }
        }
      } else {
        return { success: false, error: `Channel error: ${createErr.message}` }
      }
    } else {
      channelId = created.id
    }
  }

  // 3. Insert synthetic nudge event
  const nudgeId = crypto.randomUUID()
  const nudgeText = message || `[Nudge] You have been nudged by your operator. Check for pending work, review your tasks, and report your current status.`

  const { error: insertError } = await supabase
    .from('assistant_inbound_events')
    .insert({
      channel_id: channelId,
      external_message_id: `nudge:${nudgeId}`,
      external_user_id: 'operator:nudge',
      external_chat_id: `nudge:${agentId}`,
      message_text: nudgeText,
      message_data: {
        source: 'operator_nudge',
        nudge_id: nudgeId,
      },
      status: 'pending',
    })

  if (insertError) {
    return { success: false, error: `Insert error: ${insertError.message}` }
  }

  // 4. Emit audit event (fire-and-forget)
  try {
    await supabase.from('runtime_events').insert({
      runtime_id: null,
      org_id: orgId,
      agent_id: agentId,
      event_type: 'message_received',
      severity: 'info',
      payload: {
        type: 'operator_nudge',
        agentName: agent.name || 'Unknown',
        nudge_id: nudgeId,
      },
    })
  } catch { /* non-critical */ }

  // 5. Wake the runtime via broadcast (fire-and-forget)
  if (agent.runtime_id) {
    import('@/lib/realtime/broadcast').then(({ publishRuntimeWake }) => {
      publishRuntimeWake(agent.runtime_id as string, 'inbound')
    }).catch(() => {})
  }

  return { success: true }
}

// ─── Guardrails ───

export interface AgentGuardrails {
  approval_required_tools: string[]
  cost_limit_per_run_usd: number | null
  cost_limit_daily_usd: number | null
  cost_limit_monthly_usd: number | null
}

export async function getAgentGuardrails(
  agentId: string,
  orgId: string
): Promise<AgentGuardrails | null> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select(
      'approval_required_tools, cost_limit_per_run_usd, cost_limit_daily_usd, cost_limit_monthly_usd'
    )
    .eq('id', agentId)
    .eq('org_id', orgId)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getAgentGuardrails', agentId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return {
    approval_required_tools: (data.approval_required_tools ?? []) as string[],
    cost_limit_per_run_usd: data.cost_limit_per_run_usd as number | null,
    cost_limit_daily_usd: data.cost_limit_daily_usd as number | null,
    cost_limit_monthly_usd: data.cost_limit_monthly_usd as number | null,
  }
}

export async function updateAgentGuardrails(
  agentId: string,
  orgId: string,
  guardrails: Partial<AgentGuardrails>
): Promise<{ success: boolean; error?: string }> {
  const update: Record<string, unknown> = {}
  if (guardrails.approval_required_tools !== undefined) {
    update.approval_required_tools = guardrails.approval_required_tools
  }
  if (guardrails.cost_limit_per_run_usd !== undefined) {
    update.cost_limit_per_run_usd = guardrails.cost_limit_per_run_usd
  }
  if (guardrails.cost_limit_daily_usd !== undefined) {
    update.cost_limit_daily_usd = guardrails.cost_limit_daily_usd
  }
  if (guardrails.cost_limit_monthly_usd !== undefined) {
    update.cost_limit_monthly_usd = guardrails.cost_limit_monthly_usd
  }

  if (Object.keys(update).length === 0) {
    return { success: true }
  }

  const { error } = await supabase
    .from('ai_assistants')
    .update(update)
    .eq('id', agentId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'updateAgentGuardrails', agentId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ─── Proof Anchors ───

export interface ProofAnchor {
  id: string
  org_id: string
  agent_id: string
  run_id: string
  tool_name: string
  tool_args: Record<string, unknown>
  tool_result_hash: string | null
  policy_snapshot: Record<string, unknown> | null
  anchor_tx_hash: string | null
  anchor_chain: string | null
  anchor_status: 'pending' | 'anchored' | 'verified' | 'failed'
  verification_data: Record<string, unknown> | null
  created_at: string
}

export async function getProofLog(
  orgId: string,
  options?: { agentId?: string; limit?: number; offset?: number }
): Promise<ProofAnchor[]> {
  const { data, error } = await supabase.rpc('mc_proof_log', {
    p_org_id: orgId,
    p_agent_id: options?.agentId ?? null,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'mc_proof_log', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data || []) as ProofAnchor[]
}

export async function getProofDetail(
  proofId: string,
  orgId: string
): Promise<ProofAnchor | null> {
  const { data, error } = await supabase.rpc('mc_proof_detail', {
    p_proof_id: proofId,
    p_org_id: orgId,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'mc_proof_detail', proofId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  const rows = data as ProofAnchor[] | null
  return rows?.[0] ?? null
}

export async function createProofAnchor(params: {
  orgId: string
  agentId: string
  runId: string
  toolName: string
  toolArgs: Record<string, unknown>
  toolResultHash?: string
  policySnapshot?: Record<string, unknown>
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('mc_proof_anchors')
    .insert({
      org_id: params.orgId,
      agent_id: params.agentId,
      run_id: params.runId,
      tool_name: params.toolName,
      tool_args: params.toolArgs,
      tool_result_hash: params.toolResultHash ?? null,
      policy_snapshot: params.policySnapshot ?? null,
      anchor_status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'createProofAnchor', ...params },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return { id: data.id }
}

// ─── Create Pending Approval (called from worker) ───

export async function createPendingApproval(params: {
  orgId: string
  agentId: string
  runId: string
  toolName: string
  toolArgs: Record<string, unknown>
  estimatedCostUsd?: number
  riskLevel?: string
  timeoutSeconds?: number
}): Promise<{ id: string } | null> {
  const expiresAt = new Date(
    Date.now() + (params.timeoutSeconds ?? 300) * 1000
  ).toISOString()

  const { data, error } = await supabase
    .from('mc_pending_approvals')
    .insert({
      org_id: params.orgId,
      agent_id: params.agentId,
      run_id: params.runId,
      tool_name: params.toolName,
      tool_args: params.toolArgs,
      estimated_cost_usd: params.estimatedCostUsd ?? null,
      risk_level: params.riskLevel ?? 'medium',
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'createPendingApproval', ...params },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return { id: data.id }
}

// ─── Canvas Topology ───

export interface CanvasTopologyData {
  agents: Array<{
    id: string
    name: string
    mc_status: string | null
    lucid_model: string
    runtime_id: string | null
    channels: Array<{ id: string; channel_type: string; is_active: boolean }>
  }>
  healthScores: Map<string, number>
  costToday: Map<string, { costUsd: number; tokensInput: number; tokensOutput: number }>
  runtimes: Array<{
    id: string
    display_name: string | null
    provider: string | null
    status: string | null
    runtime_tier: string | null
    cpu_percent: number | null
    ram_percent: number | null
    last_seen_at: string | null
  }>
}

/**
 * Fetch all data needed for the canvas topology view in a single call.
 * Replaces 4 direct supabase.from() queries in the topology route.
 */
export async function getCanvasTopology(orgId: string): Promise<CanvasTopologyData | null> {
  const results = await Promise.all([
    supabase
      .from('ai_assistants')
      .select(`
        id,
        name,
        mc_status,
        lucid_model,
        runtime_id,
        assistant_channels(id, channel_type, is_active)
      `)
      .eq('org_id', orgId)
      .is('deleted_at', null),
    supabase
      .from('mc_agent_health_scores')
      .select('agent_id, overall_score')
      .eq('org_id', orgId)
      .order('computed_at', { ascending: false })
      .limit(100),
    supabase
      .from('mc_agent_cost_tracking')
      .select('agent_id, estimated_cost_usd, tokens_input, tokens_output')
      .eq('org_id', orgId)
      .eq('date', new Date().toISOString().slice(0, 10)),
    supabase
      .from('dedicated_runtimes')
      .select('id, display_name, provider, status, runtime_tier, cpu_percent, ram_percent, last_seen_at')
      .eq('org_id', orgId)
      .neq('status', 'revoked'),
  ])

  const transientError = results
    .map((result) => result.error)
    .find((error) => error && isTransientSupabaseError(error))
  if (transientError) {
    throw new Error(transientError.message)
  }

  const [agentsResult, healthResult, costResult, runtimesResult] = results

  if (agentsResult.error) {
    ErrorService.captureException(agentsResult.error, {
      severity: 'error',
      context: { endpoint: 'getCanvasTopology', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  // Build health score map (latest per agent)
  const healthScores = new Map<string, number>()
  for (const row of healthResult.data ?? []) {
    if (!healthScores.has(row.agent_id)) {
      healthScores.set(row.agent_id, row.overall_score)
    }
  }

  // Build cost + token map
  const costToday = new Map<string, { costUsd: number; tokensInput: number; tokensOutput: number }>()
  for (const row of costResult.data ?? []) {
    costToday.set(row.agent_id, {
      costUsd: Number(row.estimated_cost_usd),
      tokensInput: Number(row.tokens_input ?? 0),
      tokensOutput: Number(row.tokens_output ?? 0),
    })
  }

  return {
    agents: (agentsResult.data || []).map((a) => ({
      id: a.id,
      name: a.name,
      mc_status: a.mc_status,
      lucid_model: a.lucid_model,
      runtime_id: a.runtime_id ?? null,
      channels: ((a as Record<string, unknown>).assistant_channels as Array<{ id: string; channel_type: string; is_active: boolean }>) || [],
    })),
    healthScores,
    costToday,
    runtimes: (runtimesResult.data ?? []).map((r) => ({
      id: r.id,
      display_name: r.display_name,
      provider: r.provider,
      status: r.status,
      runtime_tier: r.runtime_tier ?? null,
      cpu_percent: r.cpu_percent,
      ram_percent: r.ram_percent,
      last_seen_at: r.last_seen_at,
    })),
  }
}

export interface MissionControlOverviewSummary {
  projects: number
  agents: number
  activeAgents: number
  unhealthyAgents: number
  failedAgents: number
  approvals: number
  readyWorkItems: number
  blockedWorkItems: number
  activeRuns: number
  runtimeIncidents: number
  costTodayUsd: number
  nativeMutationBacklog: number
}

export interface MissionControlOverviewData {
  summary: MissionControlOverviewSummary
  attentionCount: number
  fleet: {
    active: number
    paused: number
    stopped: number
    failed: number
  }
  runtimes: {
    total: number
    connected: number
    degraded: number
    offline: number
  }
  hotProjects: WorkspaceAttentionProject[]
  pendingApprovals: WorkspaceAttentionApproval[]
  readyWorkItems: WorkspaceAttentionWorkItem[]
  failures: WorkspaceAttentionFailure[]
}

async function getMissionControlCostToday(orgId: string): Promise<number> {
  const { data, error } = await supabase
    .from('mc_agent_cost_tracking')
    .select('estimated_cost_usd')
    .eq('org_id', orgId)
    .eq('date', new Date().toISOString().split('T')[0])

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getMissionControlCostToday', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return 0
  }

  return (data ?? []).reduce(
    (sum: number, row: { estimated_cost_usd: number | null }) =>
      sum + Number(row.estimated_cost_usd ?? 0),
    0,
  )
}

function getMissionControlOverviewSummary(params: {
  agents: MCAgent[]
  runtimes: DedicatedRuntime[]
  attention: WorkspaceAttentionData
  nativeMutationBacklog: number
  costTodayUsd: number
}): MissionControlOverviewSummary {
  const unhealthyAgents = params.agents.filter(
    (agent) =>
      agent.status === 'failed'
      || agent.errors_last_hour > 0
      || (agent.health_score != null && agent.health_score < 70),
  ).length

  const failedAgents = params.agents.filter((agent) => agent.status === 'failed').length
  const runtimeIncidents = params.runtimes.filter((runtime) =>
    runtime.status === 'stale'
    || runtime.status === 'offline'
    || runtime.status === 'failed',
  ).length

  return {
    projects: params.attention.summary.projects,
    agents: params.agents.length,
    activeAgents: params.agents.filter((agent) => agent.status === 'active').length,
    unhealthyAgents,
    failedAgents,
    approvals: params.attention.summary.approvals,
    readyWorkItems: params.attention.summary.readyWorkItems,
    blockedWorkItems: params.attention.summary.blockedWorkItems,
    activeRuns: params.attention.summary.activeRuns,
    runtimeIncidents,
    costTodayUsd: params.costTodayUsd,
    nativeMutationBacklog: params.nativeMutationBacklog,
  }
}

export async function getMissionControlOverview(orgId: string): Promise<MissionControlOverviewData> {
  const [agents, runtimes, attention, nativeMutations, costTodayUsd] = await Promise.all([
    getMCAgentList(orgId),
    getRuntimes(orgId),
    getWorkspaceAttentionData(orgId),
    getNativeMutationOpsSummary(orgId),
    getMissionControlCostToday(orgId),
  ])

  return {
    summary: getMissionControlOverviewSummary({
      agents,
      runtimes,
      attention,
      nativeMutationBacklog: nativeMutations?.pendingCount ?? 0,
      costTodayUsd,
    }),
    attentionCount: attention.attentionCount,
    fleet: {
      active: agents.filter((agent) => agent.status === 'active').length,
      paused: agents.filter((agent) => agent.status === 'paused').length,
      stopped: agents.filter((agent) => agent.status === 'stopped').length,
      failed: agents.filter((agent) => agent.status === 'failed').length,
    },
    runtimes: {
      total: runtimes.length,
      connected: runtimes.filter((runtime) => runtime.status === 'connected').length,
      degraded: runtimes.filter(
        (runtime) => runtime.status === 'stale' || runtime.status === 'deploying',
      ).length,
      offline: runtimes.filter(
        (runtime) => runtime.status === 'offline' || runtime.status === 'failed',
      ).length,
    },
    hotProjects: attention.projects.slice(0, 5),
    pendingApprovals: attention.pendingApprovals.slice(0, 5),
    readyWorkItems: attention.readyWorkItems.slice(0, 5),
    failures: attention.failures.slice(0, 5),
  }
}

// ─── Dedicated Runtimes ───

export async function getRuntimes(orgId: string): Promise<DedicatedRuntime[]> {
  const { data, error } = await runDedicatedRuntimeSelect<Array<Record<string, unknown>>>(async (select) => {
    const result = await supabase
      .from('dedicated_runtimes')
      .select(select)
      .eq('org_id', orgId)
      .neq('status', 'revoked')
      .order('created_at', { ascending: false })

    return {
      data: (result.data as Array<Record<string, unknown>> | null) ?? null,
      error: result.error,
    }
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getRuntimes', orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => mapDedicatedRuntimeRow(row))
}

export async function listManagedRuntimes(options?: {
  orgId?: string
  limit?: number
}): Promise<DedicatedRuntime[]> {
  const { data, error } = await runDedicatedRuntimeSelect<Array<Record<string, unknown>>>(async (select) => {
    let query = supabase
      .from('dedicated_runtimes')
      .select(select)
      .eq('managed_by_lucid', true)
      .neq('status', 'revoked')
      .order('last_seen_at', { ascending: false, nullsFirst: false })

    if (options?.orgId) {
      query = query.eq('org_id', options.orgId)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const result = await query
    return {
      data: (result.data as Array<Record<string, unknown>> | null) ?? null,
      error: result.error,
    }
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'listManagedRuntimes', orgId: options?.orgId ?? null },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => mapDedicatedRuntimeRow(row))
}

export async function getRuntimeById(
  runtimeId: string,
  orgId: string
): Promise<DedicatedRuntime | null> {
  const { data, error } = await runDedicatedRuntimeSelect<Record<string, unknown>>(async (select) => {
    const result = await supabase
      .from('dedicated_runtimes')
      .select(select)
      .eq('id', runtimeId)
      .eq('org_id', orgId)
      .neq('status', 'revoked')
      .single()

    return {
      data: (result.data as Record<string, unknown> | null) ?? null,
      error: result.error,
    }
  })

  if (error) {
    if (error.code === 'PGRST116') return null
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getRuntimeById', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return mapDedicatedRuntimeRow(data as Record<string, unknown>)
}

export async function updateRuntimeEnvSnapshot(
  runtimeId: string,
  orgId: string,
  envSnapshot: NonNullable<DedicatedRuntime['envSnapshot']>,
): Promise<void> {
  const { error } = await supabase
    .from('dedicated_runtimes')
    .update({
      env_snapshot: envSnapshot,
    })
    .eq('id', runtimeId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'updateRuntimeEnvSnapshot', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

export async function createRuntime(params: {
  orgId: string
  displayName: string
  description?: string
  provider: string
  apiKeyHash: string
  runtimeTier?: string | null
  l2DeploymentId?: string
  deploymentUrl?: string
  requestId?: string
  generation?: number
  pendingAgentName?: string
  pendingAgentUserId?: string
  pendingAgentConfig?: Record<string, unknown>
  engine?: AgentEngine
  runtimeFlavor?: Exclude<RuntimeFlavor, 'shared'> | null
  channelOwnership?: ChannelOwnership | null
  dedicatedTransportMode?: DedicatedTransportMode | null
  runtimeProtocol?: RuntimeProtocol
  channelMode?: string | null
  engineMetadata?: Record<string, unknown> | null
  runtimeBootstrapConfig?: RuntimeBootstrapConfig | null
  autoUpdatePolicy?: DedicatedRuntime['autoUpdatePolicy'] | null
}): Promise<{ id: string } | null> {
  const channelOwnership = params.channelOwnership ?? mapChannelModeToOwnership(
    (params.channelMode as DedicatedRuntime['channelMode']) ?? null,
  )
  const channelMode = params.channelMode ?? mapOwnershipToChannelMode(channelOwnership)
  const runtimeFlavor = mapRuntimeFlavor(
    params.runtimeFlavor ?? null,
    (channelMode as DedicatedRuntime['channelMode']) ?? null,
  )
  const dedicatedTransportMode = resolveDedicatedTransportMode({
    dedicatedTransportMode: params.dedicatedTransportMode ?? null,
    channelMode: (channelMode as DedicatedRuntime['channelMode']) ?? null,
    channelOwnership,
  })

  const { data, error } = await supabase
    .from('dedicated_runtimes')
    .insert({
      org_id: params.orgId,
      display_name: params.displayName,
      description: params.description ?? null,
      provider: params.provider,
      api_key_hash: params.apiKeyHash,
      managed_by_lucid: Boolean(params.l2DeploymentId),
      engine: params.engine ?? 'openclaw',
      runtime_tier: params.runtimeTier ?? null,
      runtime_flavor: runtimeFlavor,
      channel_ownership: channelOwnership ?? 'lucid_relay',
      runtime_protocol: params.runtimeProtocol ?? 'lucid-runtime-v1',
      dedicated_transport_mode: dedicatedTransportMode,
      engine_metadata: params.engineMetadata ?? {},
      runtime_bootstrap_config: params.runtimeBootstrapConfig ?? null,
      channel_mode: channelMode ?? 'relay',
      maintenance_channel: params.runtimeTier === 'dedicated' ? 'stable' : undefined,
      auto_update_policy: params.autoUpdatePolicy ?? (params.runtimeTier === 'dedicated' ? 'full_auto' : undefined),
      l2_deployment_id: params.l2DeploymentId ?? null,
      deployment_url: params.deploymentUrl ?? null,
      ...(params.requestId && { request_id: params.requestId }),
      ...(params.generation != null && { generation: params.generation }),
      ...(params.pendingAgentName && {
        pending_agent_name: params.pendingAgentName,
        pending_agent_user_id: params.pendingAgentUserId ?? null,
        pending_agent_config: params.pendingAgentConfig ?? {},
        intent_status: 'pending',
      }),
    })
    .select('id')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'createRuntime', displayName: params.displayName },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return { id: data.id }
}

export async function getRuntimeByRequestId(
  requestId: string,
  orgId: string
): Promise<{ id: string; status: string; deploymentUrl: string | null } | null> {
  const { data, error } = await supabase
    .from('dedicated_runtimes')
    .select('id, status, deployment_url')
    .eq('request_id', requestId)
    .eq('org_id', orgId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getRuntimeByRequestId', requestId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return {
    id: data.id,
    status: data.status,
    deploymentUrl: data.deployment_url,
  }
}

export async function updateRuntimeStatus(
  runtimeId: string,
  orgId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('dedicated_runtimes')
    .update({ status })
    .eq('id', runtimeId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'updateRuntimeStatus', runtimeId, status },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

export async function updateRuntimeConfiguration(params: {
  runtimeId: string
  orgId: string
  engine?: AgentEngine
  runtimeFlavor?: Exclude<RuntimeFlavor, 'shared'>
  channelOwnership?: ChannelOwnership
  autoUpdatePolicy?: DedicatedRuntime['autoUpdatePolicy']
  maintenanceChannel?: DedicatedRuntime['maintenanceChannel']
  runtimeBootstrapConfig?: RuntimeBootstrapConfig | null
}): Promise<{ success: boolean; error?: string }> {
  const updates: Record<string, unknown> = {}
  if (params.engine) updates.engine = params.engine
  if (params.runtimeFlavor) updates.runtime_flavor = params.runtimeFlavor
  if (params.channelOwnership) {
    updates.channel_ownership = params.channelOwnership
    updates.channel_mode = mapOwnershipToChannelMode(params.channelOwnership)
  }
  if (params.autoUpdatePolicy) updates.auto_update_policy = params.autoUpdatePolicy
  if (params.maintenanceChannel) updates.maintenance_channel = params.maintenanceChannel
  if (params.runtimeBootstrapConfig !== undefined) updates.runtime_bootstrap_config = params.runtimeBootstrapConfig

  if (Object.keys(updates).length === 0) return { success: true }

  const { error } = await supabase
    .from('dedicated_runtimes')
    .update(updates)
    .eq('id', params.runtimeId)
    .eq('org_id', params.orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'updateRuntimeConfiguration', runtimeId: params.runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function getRuntimeGeneration(
  runtimeId: string,
  orgId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('dedicated_runtimes')
    .select('generation')
    .eq('id', runtimeId)
    .eq('org_id', orgId)
    .single()

  if (error) return null
  return data?.generation ?? null
}

export async function updateRuntimeApiKeyHash(
  runtimeId: string,
  orgId: string,
  apiKeyHash: string
): Promise<void> {
  const { error } = await supabase
    .from('dedicated_runtimes')
    .update({ api_key_hash: apiKeyHash })
    .eq('id', runtimeId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { runtimeId },
      tags: { layer: 'db', module: 'mission-control' },
    })
    throw error
  }
}

export async function updateRuntimeL2Deployment(
  runtimeId: string,
  orgId: string,
  l2DeploymentId: string,
  deploymentUrl: string | null,
  l2PassportId?: string | null,
  ownership?: {
    passportOwner?: string | null
    ownerMode?: DedicatedRuntime['l2OwnerMode'] | null
    claimStatus?: DedicatedRuntime['l2ClaimStatus'] | null
    claimedByUserId?: string | null
    claimedAt?: string | null
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    l2_deployment_id: l2DeploymentId,
    deployment_url: deploymentUrl,
    managed_by_lucid: true,
  }
  if (l2PassportId !== undefined) {
    updates.l2_passport_id = l2PassportId
  }
  if (ownership) {
    if (ownership.passportOwner !== undefined) updates.l2_passport_owner = ownership.passportOwner
    if (ownership.ownerMode !== undefined) updates.l2_owner_mode = ownership.ownerMode
    if (ownership.claimStatus !== undefined) updates.l2_claim_status = ownership.claimStatus
    if (ownership.claimedByUserId !== undefined) updates.l2_claimed_by_user_id = ownership.claimedByUserId
    if (ownership.claimedAt !== undefined) updates.l2_claimed_at = ownership.claimedAt
  }

  const { error } = await supabase
    .from('dedicated_runtimes')
    .update(updates)
    .eq('id', runtimeId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { runtimeId, l2DeploymentId, l2PassportId },
      tags: { layer: 'db', module: 'mission-control' },
    })
  }
}

export async function updateRuntimeL2Ownership(
  runtimeId: string,
  orgId: string,
  ownership: {
    passportOwner?: string | null
    ownerMode?: DedicatedRuntime['l2OwnerMode'] | null
    claimStatus?: DedicatedRuntime['l2ClaimStatus'] | null
    claimedByUserId?: string | null
    claimedAt?: string | null
  },
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if (ownership.passportOwner !== undefined) updates.l2_passport_owner = ownership.passportOwner
  if (ownership.ownerMode !== undefined) updates.l2_owner_mode = ownership.ownerMode
  if (ownership.claimStatus !== undefined) updates.l2_claim_status = ownership.claimStatus
  if (ownership.claimedByUserId !== undefined) updates.l2_claimed_by_user_id = ownership.claimedByUserId
  if (ownership.claimedAt !== undefined) updates.l2_claimed_at = ownership.claimedAt
  if (Object.keys(updates).length === 0) return

  const { error } = await supabase
    .from('dedicated_runtimes')
    .update(updates)
    .eq('id', runtimeId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { runtimeId, ownership },
      tags: { layer: 'db', module: 'mission-control' },
    })
  }
}

export async function updateRuntimeImageTracking(
  runtimeId: string,
  orgId: string,
  params: {
    currentImageRef?: string | null
    currentImageDigest?: string | null
    targetImageRef?: string | null
    lastSuccessfulImageRef?: string | null
  },
): Promise<void> {
  const updates: Record<string, unknown> = {}

  if (params.currentImageRef !== undefined) {
    updates.current_image_ref = params.currentImageRef
  }
  if (params.currentImageDigest !== undefined) {
    updates.current_image_digest = params.currentImageDigest
  }
  if (params.targetImageRef !== undefined) {
    updates.target_image_ref = params.targetImageRef
  }
  if (params.lastSuccessfulImageRef !== undefined) {
    updates.last_successful_image_ref = params.lastSuccessfulImageRef
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await supabase
    .from('dedicated_runtimes')
    .update(updates)
    .eq('id', runtimeId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'updateRuntimeImageTracking', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

/** Persist L2 status snapshot on the runtime row */
export async function updateRuntimeL2Status(
  runtimeId: string,
  status: string,
  error?: string | null
): Promise<void> {
  const { error: dbError } = await supabase
    .from('dedicated_runtimes')
    .update({
      last_l2_status: status,
      last_l2_error: error ?? null,
      last_l2_checked_at: new Date().toISOString(),
    })
    .eq('id', runtimeId)

  if (dbError) {
    ErrorService.captureException(dbError, {
      severity: 'warning',
      context: { runtimeId, status },
      tags: { layer: 'db', module: 'mission-control' },
    })
  }
}

export async function listRuntimeMaintenanceJobs(
  runtimeId: string,
  orgId: string,
  limit = 10
): Promise<RuntimeMaintenanceJob[]> {
  const { data, error } = await supabase
    .from('runtime_maintenance_jobs')
    .select(RUNTIME_MAINTENANCE_JOB_SELECT)
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'listRuntimeMaintenanceJobs', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data ?? []).map((row) => mapRuntimeMaintenanceJobRow(row as Record<string, unknown>))
}

export async function createRuntimeMaintenanceJob(params: {
  runtimeId: string
  orgId: string
  provider: string
  action: RuntimeMaintenanceAction
  requestedBy: string | null
  targetImageRef?: string | null
  targetImageDigest?: string | null
}): Promise<RuntimeMaintenanceJob | null> {
  const { data, error } = await supabase
    .from('runtime_maintenance_jobs')
    .insert({
      runtime_id: params.runtimeId,
      org_id: params.orgId,
      provider: params.provider,
      action: params.action,
      requested_by: params.requestedBy,
      target_image_ref: params.targetImageRef ?? null,
      target_image_digest: params.targetImageDigest ?? null,
      status: 'queued',
    })
    .select(RUNTIME_MAINTENANCE_JOB_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'createRuntimeMaintenanceJob', runtimeId: params.runtimeId, action: params.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return mapRuntimeMaintenanceJobRow(data as Record<string, unknown>)
}

export async function markRuntimeMaintenanceJobRunning(
  jobId: string,
  runtimeId: string
): Promise<void> {
  const { error } = await supabase
    .from('runtime_maintenance_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('runtime_id', runtimeId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'markRuntimeMaintenanceJobRunning', jobId, runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

export async function updateRuntimeMaintenanceJobProgress(params: {
  jobId: string
  runtimeId: string
  orgId: string
  action: RuntimeMaintenanceAction
  providerOperationId?: string | null
  providerDeploymentId?: string | null
  targetImageRef?: string | null
  targetImageDigest?: string | null
  resultPayload?: Record<string, unknown>
}): Promise<void> {
  const now = new Date().toISOString()

  const { error: jobError } = await supabase
    .from('runtime_maintenance_jobs')
    .update({
      status: 'running',
      provider_operation_id: params.providerOperationId ?? null,
      provider_deployment_id: params.providerDeploymentId ?? null,
      target_image_ref: params.targetImageRef ?? null,
      target_image_digest: params.targetImageDigest ?? null,
      result_payload: params.resultPayload ?? {},
      error: null,
    })
    .eq('id', params.jobId)
    .eq('runtime_id', params.runtimeId)

  if (jobError) {
    ErrorService.captureException(jobError, {
      severity: 'warning',
      context: { endpoint: 'updateRuntimeMaintenanceJobProgress', jobId: params.jobId, runtimeId: params.runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }

  const runtimeUpdates: Record<string, unknown> = {
    managed_by_lucid: true,
    last_maintenance_action: params.action,
    last_maintenance_at: now,
    last_maintenance_error: null,
  }

  if (params.targetImageRef !== undefined) {
    runtimeUpdates.target_image_ref = params.targetImageRef
  }

  const { error: runtimeError } = await supabase
    .from('dedicated_runtimes')
    .update(runtimeUpdates)
    .eq('id', params.runtimeId)
    .eq('org_id', params.orgId)

  if (runtimeError) {
    ErrorService.captureException(runtimeError, {
      severity: 'warning',
      context: { endpoint: 'updateRuntimeMaintenanceJobProgressRuntimeUpdate', runtimeId: params.runtimeId, action: params.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

export async function completeRuntimeMaintenanceJob(params: {
  jobId: string
  runtimeId: string
  orgId: string
  action: RuntimeMaintenanceAction
  providerOperationId?: string | null
  providerDeploymentId?: string | null
  targetImageRef?: string | null
  targetImageDigest?: string | null
  resultPayload?: Record<string, unknown>
}): Promise<void> {
  const now = new Date().toISOString()

  const { error: jobError } = await supabase
    .from('runtime_maintenance_jobs')
    .update({
      status: 'succeeded',
      provider_operation_id: params.providerOperationId ?? null,
      provider_deployment_id: params.providerDeploymentId ?? null,
      target_image_ref: params.targetImageRef ?? null,
      target_image_digest: params.targetImageDigest ?? null,
      result_payload: params.resultPayload ?? {},
      error: null,
      completed_at: now,
    })
    .eq('id', params.jobId)
    .eq('runtime_id', params.runtimeId)

  if (jobError) {
    ErrorService.captureException(jobError, {
      severity: 'warning',
      context: { endpoint: 'completeRuntimeMaintenanceJob', jobId: params.jobId, runtimeId: params.runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }

  const runtimeUpdates: Record<string, unknown> = {
    managed_by_lucid: true,
    last_maintenance_action: params.action,
    last_maintenance_at: now,
    last_maintenance_error: null,
  }
  if (params.targetImageDigest !== undefined) {
    runtimeUpdates.current_image_digest = params.targetImageDigest
  }
  if (params.targetImageRef !== undefined) {
    runtimeUpdates.current_image_ref = params.targetImageRef
    runtimeUpdates.target_image_ref = params.targetImageRef
    runtimeUpdates.last_successful_image_ref = params.targetImageRef
  }

  const { error: runtimeError } = await supabase
    .from('dedicated_runtimes')
    .update(runtimeUpdates)
    .eq('id', params.runtimeId)
    .eq('org_id', params.orgId)

  if (runtimeError) {
    ErrorService.captureException(runtimeError, {
      severity: 'warning',
      context: { endpoint: 'completeRuntimeMaintenanceRuntimeUpdate', runtimeId: params.runtimeId, action: params.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

export async function failRuntimeMaintenanceJob(params: {
  jobId: string
  runtimeId: string
  orgId: string
  action: RuntimeMaintenanceAction
  errorMessage: string
  resultPayload?: Record<string, unknown>
}): Promise<void> {
  const now = new Date().toISOString()

  const { error: jobError } = await supabase
    .from('runtime_maintenance_jobs')
    .update({
      status: 'failed',
      error: params.errorMessage,
      result_payload: params.resultPayload ?? {},
      completed_at: now,
    })
    .eq('id', params.jobId)
    .eq('runtime_id', params.runtimeId)

  if (jobError) {
    ErrorService.captureException(jobError, {
      severity: 'warning',
      context: { endpoint: 'failRuntimeMaintenanceJob', jobId: params.jobId, runtimeId: params.runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }

  const { error: runtimeError } = await supabase
    .from('dedicated_runtimes')
    .update({
      last_maintenance_action: params.action,
      last_maintenance_at: now,
      last_maintenance_error: params.errorMessage,
    })
    .eq('id', params.runtimeId)
    .eq('org_id', params.orgId)

  if (runtimeError) {
    ErrorService.captureException(runtimeError, {
      severity: 'warning',
      context: { endpoint: 'failRuntimeMaintenanceRuntimeUpdate', runtimeId: params.runtimeId, action: params.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

export async function getRuntimeMaintenanceState(
  runtimeId: string,
  orgId: string,
  limit = 10
): Promise<RuntimeMaintenanceState | null> {
  const runtime = await getRuntimeById(runtimeId, orgId)
  if (!runtime) return null

  const jobs = await listRuntimeMaintenanceJobs(runtimeId, orgId, limit)
  return {
    runtimeId: runtime.id,
    managedByLucid: runtime.managedByLucid,
    maintenanceChannel: runtime.maintenanceChannel,
    autoUpdatePolicy: runtime.autoUpdatePolicy,
    currentImageRef: runtime.currentImageRef,
    currentImageDigest: runtime.currentImageDigest,
    targetImageRef: runtime.targetImageRef,
    lastSuccessfulImageRef: runtime.lastSuccessfulImageRef,
    lastMaintenanceAction: runtime.lastMaintenanceAction,
    lastMaintenanceAt: runtime.lastMaintenanceAt,
    lastMaintenanceError: runtime.lastMaintenanceError,
    jobs,
  }
}

export async function revokeRuntime(
  runtimeId: string,
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('dedicated_runtimes')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('id', runtimeId)
    .eq('org_id', orgId)
    .neq('status', 'revoked')

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'revokeRuntime', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: error.message }
  }

  // Unlink agents from this runtime
  await supabase
    .from('ai_assistants')
    .update({ runtime_id: null })
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)

  return { success: true }
}

export async function updateAgentRuntime(
  agentId: string,
  orgId: string,
  runtimeId: string | null
): Promise<{ success: boolean; error?: string }> {
  // If assigning to a runtime, verify it exists and belongs to the same org
  if (runtimeId) {
    const { data: runtime, error: runtimeErr } = await supabase
      .from('dedicated_runtimes')
      .select('id, status')
      .eq('id', runtimeId)
      .eq('org_id', orgId)
      .single()

    if (runtimeErr || !runtime) {
      return { success: false, error: 'Runtime not found' }
    }
    if (runtime.status === 'revoked') {
      return { success: false, error: 'Runtime has been revoked' }
    }
  }

  const { error } = await supabase
    .from('ai_assistants')
    .update({ runtime_id: runtimeId })
    .eq('id', agentId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'updateAgentRuntime', agentId, runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function updateRuntimeHeartbeat(
  runtimeId: string,
  generation: number,
  metrics: {
    engine?: AgentEngine
    runtimeProtocol?: RuntimeProtocol
    engineVersion?: string
    runtimeVersion?: string
    cpuPercent: number
    ramPercent: number
    diskPercent: number
    gpuPercent?: number
    pendingEvents: number
    deadLetters: number
    openclawVersion?: string
    agentCount: number
    uptimeSeconds: number
    status?: 'connected' | 'shutdown'
    systemInfo?: {
      cpuModel?: string
      cpuCores?: number
      ramTotalGb?: number
      diskTotalGb?: number
      platform?: string
      arch?: string
    } | null
    adapterIdentity?: RuntimeAdapterIdentity | null
    nativeCapabilities?: RuntimeNativeCapability[]
    runtimeServices?: RuntimeServiceDescriptor[]
    adapterProbe?: RuntimeAdapterProbeSummary | null
    transcriptParser?: RuntimeTranscriptParserStatus | null
    commandSpec?: RuntimeCommandSpec | null
    engineHomePolicy?: RuntimeEngineHomePolicy | null
  }
): Promise<{ writeHistory: boolean; error?: string; previousStatus?: string; intentPending?: boolean }> {
  // Verify generation matches (reject stale heartbeats)
  const { data: runtime, error: fetchError } = await supabase
    .from('dedicated_runtimes')
    .select('generation, heartbeat_counter, status, org_id, display_name, intent_status')
    .eq('id', runtimeId)
    .single()

  if (fetchError || !runtime) {
    return { writeHistory: false, error: 'Runtime not found' }
  }

  if (runtime.status === 'revoked') {
    return { writeHistory: false, error: 'Runtime revoked' }
  }

  if (runtime.generation !== generation) {
    return { writeHistory: false, error: 'Generation mismatch — stale heartbeat rejected' }
  }

  const newCounter = (runtime.heartbeat_counter || 0) + 1
  const writeHistory = newCounter % 5 === 0
  const capabilityReport: Record<string, unknown> = {}
  if (metrics.adapterIdentity !== undefined) capabilityReport.adapter_identity = metrics.adapterIdentity
  if (metrics.nativeCapabilities !== undefined) capabilityReport.native_capabilities = metrics.nativeCapabilities
  if (metrics.runtimeServices !== undefined) capabilityReport.runtime_services = metrics.runtimeServices
  if (metrics.adapterProbe !== undefined) capabilityReport.adapter_probe_result = metrics.adapterProbe
  if (metrics.transcriptParser !== undefined) capabilityReport.transcript_parser_status = metrics.transcriptParser
  if (metrics.commandSpec !== undefined) capabilityReport.runtime_command_spec = metrics.commandSpec
  if (metrics.engineHomePolicy !== undefined) capabilityReport.engine_home_policy = metrics.engineHomePolicy
  if (Object.keys(capabilityReport).length > 0) {
    capabilityReport.capability_reported_at = new Date().toISOString()
  }

  const { error: updateError } = await supabase
    .from('dedicated_runtimes')
    .update({
      cpu_percent: metrics.cpuPercent,
      ram_percent: metrics.ramPercent,
      disk_percent: metrics.diskPercent,
      gpu_percent: metrics.gpuPercent ?? null,
      worker_pending_events: metrics.pendingEvents,
      worker_dead_letters: metrics.deadLetters,
      openclaw_version: metrics.openclawVersion ?? metrics.runtimeVersion ?? null,
      ...(metrics.engine && { engine: metrics.engine }),
      ...(metrics.runtimeProtocol && { runtime_protocol: metrics.runtimeProtocol }),
      ...(metrics.engineVersion !== undefined && { engine_version: metrics.engineVersion ?? null }),
      ...(metrics.runtimeVersion !== undefined && { runtime_version: metrics.runtimeVersion ?? null }),
      agent_count: metrics.agentCount,
      uptime_seconds: metrics.uptimeSeconds,
      last_seen_at: new Date().toISOString(),
      status: metrics.status === 'shutdown' ? 'offline' : 'connected',
      heartbeat_counter: newCounter,
      ...(metrics.systemInfo != null && { system_info: metrics.systemInfo }),
      ...capabilityReport,
    })
    .eq('id', runtimeId)
    .eq('generation', generation)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: { endpoint: 'updateRuntimeHeartbeat', runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { writeHistory: false, error: updateError.message }
  }

  // Emit reconnection event if runtime was previously stale/offline
  const wasOffline = runtime.status === 'stale' || runtime.status === 'offline'
  if (wasOffline) {
    await emitRuntimeReconnectedEvent(runtimeId, runtime.org_id, runtime.display_name)
  }

  // Write coalesced history snapshot (every 5th beat = every 2.5 min)
  if (writeHistory) {
    const { error: histError } = await supabase
      .from('vps_health_snapshots')
      .insert({
        org_id: runtime.org_id,
        runtime_id: runtimeId,
        instance_id: runtimeId,
        cpu_percent: metrics.cpuPercent,
        ram_percent: metrics.ramPercent,
        disk_percent: metrics.diskPercent,
        worker_pending_events: metrics.pendingEvents,
        worker_dead_letters: metrics.deadLetters,
        openclaw_version: metrics.openclawVersion,
      })

    if (histError) {
      ErrorService.captureException(histError, {
        severity: 'warning',
        context: { endpoint: 'updateRuntimeHeartbeat:history', runtimeId },
        tags: { layer: 'db', route: 'mission-control' },
      })
    }
  }

  return {
    writeHistory,
    previousStatus: runtime.status,
    intentPending: runtime.intent_status === 'pending',
  }
}

export async function getRuntimeManagementCommands(
  runtimeId: string,
  orgId: string,
  limit = 20,
): Promise<RuntimeManagementCommand[]> {
  const { data, error } = await supabase
    .from('runtime_management_commands')
    .select(RUNTIME_MANAGEMENT_COMMAND_SELECT)
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)
    .order('requested_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'getRuntimeManagementCommands', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => mapRuntimeManagementCommandRow(row))
}

export async function createRuntimeManagementCommand(params: {
  runtimeId: string
  orgId: string
  commandType: string
  targetCapabilityId?: string | null
  payload?: Record<string, unknown>
  requestedBy?: string | null
  expiresAt?: string | null
}): Promise<{ command: RuntimeManagementCommand | null; error?: string }> {
  const { data, error } = await supabase
    .from('runtime_management_commands')
    .insert({
      runtime_id: params.runtimeId,
      org_id: params.orgId,
      command_type: params.commandType,
      target_capability_id: params.targetCapabilityId ?? null,
      payload: params.payload ?? {},
      requested_by: params.requestedBy ?? null,
      expires_at: params.expiresAt ?? null,
    })
    .select(RUNTIME_MANAGEMENT_COMMAND_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'createRuntimeManagementCommand', runtimeId: params.runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { command: null, error: error.message }
  }

  return { command: mapRuntimeManagementCommandRow(data as Record<string, unknown>) }
}

export async function claimRuntimeManagementCommands(
  runtimeId: string,
  limit = 20,
): Promise<RuntimeManagementCommand[]> {
  const now = new Date().toISOString()
  const staleSentBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { error: staleError } = await supabase
    .from('runtime_management_commands')
    .update({
      status: 'queued',
      dispatched_at: null,
    })
    .eq('runtime_id', runtimeId)
    .eq('status', 'sent')
    .lt('dispatched_at', staleSentBefore)
    .is('acknowledged_at', null)

  if (staleError) {
    ErrorService.captureException(staleError, {
      severity: 'warning',
      context: { endpoint: 'claimRuntimeManagementCommands:requeueStaleSent', runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }

  const { data: queued, error: selectError } = await supabase
    .from('runtime_management_commands')
    .select(RUNTIME_MANAGEMENT_COMMAND_SELECT)
    .eq('runtime_id', runtimeId)
    .eq('status', 'queued')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('requested_at', { ascending: true })
    .limit(limit)

  if (selectError || !queued?.length) {
    if (selectError) {
      ErrorService.captureException(selectError, {
        severity: 'warning',
        context: { endpoint: 'claimRuntimeManagementCommands:select', runtimeId },
        tags: { layer: 'db', route: 'mission-control' },
      })
    }
    return []
  }

  const ids = queued.map((row) => row.id as string)
  const { data, error } = await supabase
    .from('runtime_management_commands')
    .update({
      status: 'sent',
      dispatched_at: now,
    })
    .in('id', ids)
    .eq('runtime_id', runtimeId)
    .eq('status', 'queued')
    .select(RUNTIME_MANAGEMENT_COMMAND_SELECT)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'claimRuntimeManagementCommands:update', runtimeId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => mapRuntimeManagementCommandRow(row))
}

export async function ackRuntimeManagementCommand(params: {
  runtimeId: string
  commandId: string
  status: Extract<
    RuntimeManagementCommandStatus,
    'accepted' | 'rejected' | 'needs_user_action' | 'applied' | 'failed'
  >
  response?: Record<string, unknown> | null
  error?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('runtime_management_commands')
    .update({
      status: params.status,
      response: params.response ?? null,
      error: params.error ?? null,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', params.commandId)
    .eq('runtime_id', params.runtimeId)
    .in('status', ['queued', 'sent', 'accepted', 'needs_user_action'])

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'ackRuntimeManagementCommand', runtimeId: params.runtimeId, commandId: params.commandId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function insertRuntimeEvents(
  runtimeId: string,
  orgId: string,
  events: Array<{
    agentId?: string
    eventType: string
    severity?: string
    payload?: Record<string, unknown>
    ingestEventId?: string
  }>
): Promise<{ inserted: number; error?: string }> {
  const rows = events.map((e) => ({
    runtime_id: runtimeId,
    org_id: orgId,
    agent_id: e.agentId ?? null,
    event_type: e.eventType,
    severity: e.severity ?? 'info',
    payload: e.payload ?? {},
    ...(e.ingestEventId ? { ingest_event_id: e.ingestEventId } : {}),
  }))

  const { error } = await supabase.from('runtime_events').insert(rows)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'insertRuntimeEvents', runtimeId, count: events.length },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { inserted: 0, error: error.message }
  }

  const nativeMutationCandidates = events.flatMap((event) => {
    const payload = event.payload ?? {}
    const isFirstClass = event.eventType === 'native_mutation_candidate'
    const isLegacy =
      event.eventType === 'tool_call' &&
      payload.toolEventType === 'native_mutation_candidate'

    if (!isFirstClass && !isLegacy) return []
    if (!event.agentId) return []

    const runId = typeof payload.runId === 'string' ? payload.runId : null
    const source = payload.source
    const engine = payload.mutationEngine
    const runtimeFlavor = payload.mutationRuntimeFlavor
    const mutationKind = payload.mutationKind
    const toolName = payload.toolName
    const toolArgs = payload.toolArgs
    const reason = payload.reason

    if (
      !runId ||
      (source !== 'shared' && source !== 'relay' && source !== 'native') ||
      typeof engine !== 'string' ||
      (runtimeFlavor !== 'shared' && runtimeFlavor !== 'c1_managed' && runtimeFlavor !== 'c2a_autonomous') ||
      (mutationKind !== 'memory_write' &&
        mutationKind !== 'skill_create' &&
        mutationKind !== 'skill_update' &&
        mutationKind !== 'skill_delete') ||
      typeof toolName !== 'string' ||
      typeof reason !== 'string'
    ) {
      return []
    }

    return [{
      runtime_id: runtimeId,
      org_id: orgId,
      agent_id: event.agentId,
      run_id: runId,
      source,
      engine,
      runtime_flavor: runtimeFlavor,
      mutation_kind: mutationKind,
      tool_name: toolName,
      tool_args: typeof toolArgs === 'object' && toolArgs != null ? toolArgs : {},
      reason,
    }]
  })

  if (nativeMutationCandidates.length > 0) {
    const { error: candidateError } = await supabase
      .from('mc_native_mutation_candidates')
      .insert(nativeMutationCandidates)

    if (candidateError) {
      ErrorService.captureException(candidateError, {
        severity: 'error',
        context: {
          endpoint: 'insertRuntimeEvents:nativeMutationCandidates',
          runtimeId,
          count: nativeMutationCandidates.length,
        },
        tags: { layer: 'db', route: 'mission-control' },
      })
      return { inserted: 0, error: candidateError.message }
    }
  }

  return { inserted: events.length }
}

export interface NativeMutationCandidateRecord {
  id: string
  agent_id: string
  org_id: string
  runtime_id: string | null
  run_id: string
  source: 'shared' | 'relay' | 'native'
  engine: string
  runtime_flavor: 'shared' | 'c1_managed' | 'c2a_autonomous'
  mutation_kind: 'memory_write' | 'skill_create' | 'skill_update' | 'skill_delete'
  tool_name: string
  tool_args: Record<string, unknown>
  reason: string
  status: 'pending' | 'applying' | 'approved' | 'rejected' | 'promoted'
  promotion_scope: 'assistant_durable' | 'org_durable' | null
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_attempts: number
  last_error: string | null
  last_error_at: string | null
  applied_record_id: string | null
  applied_at: string | null
  created_at: string
}

export interface NativeMutationCandidateQuery {
  assistantId?: string
  status?: NativeMutationCandidateRecord['status']
  mutationKind?: NativeMutationCandidateRecord['mutation_kind']
  limit?: number
  failuresOnly?: boolean
}

export interface NativeMutationOpsSummary {
  pendingCount: number
  promotedLast24h: number
  reviewedLast24h: number
  failedLast24h: number
  oldestPendingCreatedAt: string | null
  pendingByEngine: Record<string, number>
  pendingByKind: Record<NativeMutationCandidateRecord['mutation_kind'], number>
  recentFailures: NativeMutationCandidateRecord[]
}

export interface ReviewNativeMutationCandidateInput {
  action: 'approve' | 'reject' | 'promote'
  reviewerId: string
  reviewNotes?: string | null
  promotionScope?: 'assistant_durable' | 'org_durable' | null
}

interface PendingMutationBreakdownRow {
  engine: string
  mutation_kind: NativeMutationCandidateRecord['mutation_kind']
  pending_count: number
}

export async function getAssistantNativeMutationCandidates(
  assistantId: string,
  orgId: string,
  limit = 50,
): Promise<NativeMutationCandidateRecord[]> {
  const { data, error } = await supabase
    .from('mc_native_mutation_candidates')
    .select(NATIVE_MUTATION_CANDIDATE_SELECT)
    .eq('agent_id', assistantId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getAssistantNativeMutationCandidates', assistantId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data ?? []) as NativeMutationCandidateRecord[]
}

export async function getOrgNativeMutationCandidates(
  orgId: string,
  options: NativeMutationCandidateQuery = {},
): Promise<NativeMutationCandidateRecord[]> {
  let query = supabase
    .from('mc_native_mutation_candidates')
    .select(NATIVE_MUTATION_CANDIDATE_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)

  if (options.assistantId) query = query.eq('agent_id', options.assistantId)
  if (options.status) query = query.eq('status', options.status)
  if (options.mutationKind) query = query.eq('mutation_kind', options.mutationKind)
  if (options.failuresOnly) query = query.not('last_error_at', 'is', null)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getOrgNativeMutationCandidates', orgId, options },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data ?? []) as NativeMutationCandidateRecord[]
}

export async function getNativeMutationOpsSummary(
  orgId: string,
): Promise<NativeMutationOpsSummary> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    pendingCountRes,
    pendingBreakdownRes,
    oldestPendingRes,
    promotedRes,
    reviewedRes,
    failedRes,
    recentFailuresRes,
  ] = await Promise.all([
    supabase
      .from('mc_native_mutation_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending'),
    supabase
      .rpc('mc_native_mutation_pending_breakdown', {
        p_org_id: orgId,
      }),
    supabase
      .from('mc_native_mutation_candidates')
      .select('created_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mc_native_mutation_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'promoted')
      .gte('reviewed_at', windowStart),
    supabase
      .from('mc_native_mutation_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['approved', 'rejected', 'promoted'])
      .gte('reviewed_at', windowStart),
    supabase
      .from('mc_native_mutation_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('last_error_at', windowStart),
    supabase
      .from('mc_native_mutation_candidates')
      .select(NATIVE_MUTATION_CANDIDATE_SELECT)
      .eq('org_id', orgId)
      .not('last_error_at', 'is', null)
      .order('last_error_at', { ascending: false })
      .limit(10),
  ])

  const countErrors = [
    pendingCountRes.error,
    pendingBreakdownRes.error,
    oldestPendingRes.error,
    promotedRes.error,
    reviewedRes.error,
    failedRes.error,
    recentFailuresRes.error,
  ].filter(Boolean)

  if (countErrors.length > 0) {
    countErrors.forEach((error) => {
      ErrorService.captureException(error as Error, {
        severity: 'error',
        context: { endpoint: 'getNativeMutationOpsSummary', orgId },
        tags: { layer: 'db', route: 'mission-control' },
      })
    })
  }

  const pendingByEngine: Record<string, number> = {}
  const pendingByKind: Record<NativeMutationCandidateRecord['mutation_kind'], number> = {
    memory_write: 0,
    skill_create: 0,
    skill_update: 0,
    skill_delete: 0,
  }

  for (const row of (pendingBreakdownRes.data ?? []) as PendingMutationBreakdownRow[]) {
    const engine = String(row.engine ?? 'unknown')
    const kind = row.mutation_kind
    const count = Number(row.pending_count ?? 0)
    pendingByEngine[engine] = (pendingByEngine[engine] ?? 0) + count
    if (kind in pendingByKind) pendingByKind[kind] += count
  }

  return {
    pendingCount: pendingCountRes.count ?? 0,
    promotedLast24h: promotedRes.count ?? 0,
    reviewedLast24h: reviewedRes.count ?? 0,
    failedLast24h: failedRes.count ?? 0,
    oldestPendingCreatedAt: (oldestPendingRes.data?.created_at as string | undefined) ?? null,
    pendingByEngine,
    pendingByKind,
    recentFailures: (recentFailuresRes.data ?? []) as NativeMutationCandidateRecord[],
  }
}

function extractCandidateMemoryContent(
  toolArgs: Record<string, unknown>,
): string | null {
  if (typeof toolArgs.content === 'string' && toolArgs.content.trim()) {
    return toolArgs.content.trim()
  }
  if (typeof toolArgs.text === 'string' && toolArgs.text.trim()) {
    return toolArgs.text.trim()
  }
  return null
}

async function applyMemoryCandidatePromotion(
  candidate: NativeMutationCandidateRecord,
  reviewerId: string,
  promotionScope: 'assistant_durable' | 'org_durable',
): Promise<string | null> {
  const content = extractCandidateMemoryContent(candidate.tool_args)
  if (!content) return null

  const contentHash = createHash('md5').update(content.toLowerCase().trim()).digest('hex')

  if (promotionScope === 'assistant_durable') {
    const { data, error } = await supabase
      .from('assistant_memory')
      .insert({
        assistant_id: candidate.agent_id,
        content,
        content_hash: contentHash,
        category: 'fact',
        importance: 0.7,
        source_user_message: null,
        source_assistant_response: `[native_mutation_candidate:${candidate.id}]`,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('assistant_memory')
          .select('id')
          .eq('assistant_id', candidate.agent_id)
          .eq('content_hash', contentHash)
          .maybeSingle()

        return (existing?.id as string | undefined) ?? null
      }
      throw error
    }

    return (data?.id as string | undefined) ?? null
  }

  const { data, error } = await supabase
    .from('org_board_memory')
    .insert({
      org_id: candidate.org_id,
      content,
      content_hash: contentHash,
      category: 'insight',
      importance: 0.7,
      source: 'native_mutation_candidate',
      source_agent_id: candidate.agent_id,
      created_by: reviewerId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('org_board_memory')
        .select('id')
        .eq('org_id', candidate.org_id)
        .eq('content_hash', contentHash)
        .maybeSingle()

      return (existing?.id as string | undefined) ?? null
    }
    throw error
  }

  return (data?.id as string | undefined) ?? null
}

export async function reviewNativeMutationCandidate(
  assistantId: string,
  orgId: string,
  candidateId: string,
  input: ReviewNativeMutationCandidateInput,
): Promise<NativeMutationCandidateRecord | null> {
  const nextStatus =
    input.action === 'approve'
      ? 'approved'
      : input.action === 'reject'
        ? 'rejected'
        : 'promoted'
  const nextPromotionScope =
    input.action === 'promote' ? (input.promotionScope ?? null) : null
  const claimStatus: NativeMutationCandidateRecord['status'] =
    input.action === 'promote' ? 'applying' : nextStatus
  const reviewedAt = new Date().toISOString()
  const { data: existing, error: fetchError } = await supabase
    .from('mc_native_mutation_candidates')
    .select(NATIVE_MUTATION_CANDIDATE_SELECT)
    .eq('id', candidateId)
    .eq('agent_id', assistantId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (fetchError) {
    ErrorService.captureException(fetchError, {
      severity: 'error',
      context: { endpoint: 'reviewNativeMutationCandidate:fetch', assistantId, orgId, candidateId, action: input.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  if (!existing) {
    return null
  }

  const reviewAttempts = ((existing as NativeMutationCandidateRecord).review_attempts ?? 0) + 1

  const { data: claimed, error: claimError } = await supabase
    .from('mc_native_mutation_candidates')
    .update({
      status: claimStatus,
      promotion_scope: nextPromotionScope,
      review_notes: input.reviewNotes ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: reviewedAt,
      review_attempts: reviewAttempts,
      last_error: null,
      last_error_at: null,
    })
    .eq('id', candidateId)
    .eq('agent_id', assistantId)
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .select(NATIVE_MUTATION_CANDIDATE_SELECT)
    .maybeSingle()

  if (claimError) {
    ErrorService.captureException(claimError, {
      severity: 'error',
      context: { endpoint: 'reviewNativeMutationCandidate:claim', assistantId, orgId, candidateId, action: input.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  if (!claimed) {
    const { data: current, error: currentError } = await supabase
      .from('mc_native_mutation_candidates')
      .select(NATIVE_MUTATION_CANDIDATE_SELECT)
      .eq('id', candidateId)
      .eq('agent_id', assistantId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (currentError) {
      ErrorService.captureException(currentError, {
        severity: 'error',
        context: { endpoint: 'reviewNativeMutationCandidate:fetch-current', assistantId, orgId, candidateId, action: input.action },
        tags: { layer: 'db', route: 'mission-control' },
      })
      return null
    }

    return (current as NativeMutationCandidateRecord | null) ?? null
  }

  const candidate = claimed as NativeMutationCandidateRecord

  if (input.action !== 'promote' || !nextPromotionScope) {
    const { data: updated, error: finalizeError } = await supabase
      .from('mc_native_mutation_candidates')
      .update({
        review_attempts: candidate.review_attempts,
      })
      .eq('id', candidateId)
      .eq('agent_id', assistantId)
      .eq('org_id', orgId)
      .eq('status', nextStatus)
      .select(NATIVE_MUTATION_CANDIDATE_SELECT)
      .single()

    if (finalizeError) {
      ErrorService.captureException(finalizeError, {
        severity: 'error',
        context: { endpoint: 'reviewNativeMutationCandidate:finalize-non-promote', assistantId, orgId, candidateId, action: input.action },
        tags: { layer: 'db', route: 'mission-control' },
      })
      return null
    }

    return updated as NativeMutationCandidateRecord
  }

  let appliedRecordId: string | null = null
  let appliedAt: string | null = null

  try {
    if (candidate.mutation_kind === 'memory_write') {
      appliedRecordId = await applyMemoryCandidatePromotion(candidate, input.reviewerId, nextPromotionScope)
      appliedAt = new Date().toISOString()
    } else if (
      candidate.mutation_kind === 'skill_create' ||
      candidate.mutation_kind === 'skill_update' ||
      candidate.mutation_kind === 'skill_delete'
    ) {
      const promoted = await promoteNativeSkillCandidate({
        candidate: {
          id: candidate.id,
          agent_id: candidate.agent_id,
          org_id: candidate.org_id,
          engine: candidate.engine,
          mutation_kind: candidate.mutation_kind,
          tool_args: candidate.tool_args,
        },
        reviewerId: input.reviewerId,
        promotionScope: nextPromotionScope,
      })
      appliedRecordId = promoted.skillId ?? promoted.installationId ?? promoted.activationId
      appliedAt = new Date().toISOString()
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to review native mutation candidate'
    const failedAt = new Date().toISOString()
    await supabase
      .from('mc_native_mutation_candidates')
      .update({
        status: 'pending',
        review_attempts: candidate.review_attempts,
        last_error: errorMessage,
        last_error_at: failedAt,
      })
      .eq('id', candidateId)
      .eq('agent_id', assistantId)
      .eq('org_id', orgId)
      .eq('status', 'applying')

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: 'reviewNativeMutationCandidate:promote', assistantId, orgId, candidateId, action: input.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  const { data: updated, error: finalizeError } = await supabase
    .from('mc_native_mutation_candidates')
    .update({
      status: 'promoted',
      review_attempts: candidate.review_attempts,
      applied_record_id: appliedRecordId,
      applied_at: appliedAt,
      last_error: null,
      last_error_at: null,
    })
    .eq('id', candidateId)
    .eq('agent_id', assistantId)
    .eq('org_id', orgId)
    .eq('status', 'applying')
    .select(NATIVE_MUTATION_CANDIDATE_SELECT)
    .single()

  if (finalizeError) {
    ErrorService.captureException(finalizeError, {
      severity: 'error',
      context: { endpoint: 'reviewNativeMutationCandidate:finalize-promote', assistantId, orgId, candidateId, action: input.action },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return updated as NativeMutationCandidateRecord
}

export async function getRuntimeHealthHistory(
  runtimeId: string,
  orgId: string,
  limit = 50
): Promise<Array<{ reportedAt: string; cpuPercent: number; ramPercent: number; diskPercent: number }>> {
  const { data, error } = await supabase
    .from('vps_health_snapshots')
    .select('reported_at, cpu_percent, ram_percent, disk_percent')
    .eq('runtime_id', runtimeId)
    .eq('org_id', orgId)
    .order('reported_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getRuntimeHealthHistory', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    reportedAt: row.reported_at as string,
    cpuPercent: Number(row.cpu_percent || 0),
    ramPercent: Number(row.ram_percent || 0),
    diskPercent: Number(row.disk_percent || 0),
  }))
}

/**
 * Check for runtimes that have been offline for 1+ hour and emit feed events.
 * Also marks runtimes as 'stale' (5-min) or 'offline' (1-hour) based on last_seen_at.
 * Idempotent: only emits one event per runtime per offline period.
 */
export async function checkRuntimeOfflineEvents(): Promise<{ updated: number; eventsInserted: number }> {
  const now = new Date()
  const { offlineBefore } = getRuntimePresenceThresholds(now.getTime())

  // Step 1: Get all connected runtimes from Postgres
  const { data: connectedRuntimes } = await supabase
    .from('dedicated_runtimes')
    .select('id, org_id, display_name, last_seen_at')
    .eq('status', 'connected')

  // Step 2: Check Redis for fresher lastSeenAt (if available)
  let redisMetrics = new Map<string, { lastSeenAt: string }>()
  if (connectedRuntimes && connectedRuntimes.length > 0) {
    try {
      const { getLiveMetrics, isRedisAvailable } = await import('@/lib/redis/streams')
      if (isRedisAvailable()) {
        const runtimeIds = connectedRuntimes.map((r: { id: string }) => r.id)
        const metrics = await getLiveMetrics(runtimeIds)
        redisMetrics = metrics
      }
    } catch {
      // Redis unavailable — proceed with Postgres-only check
    }
  }

  // Step 3: Filter — only mark stale if BOTH Redis and Postgres are stale
  const trulyStaleIds: string[] = []
  if (connectedRuntimes && connectedRuntimes.length > 0) {
    for (const rt of connectedRuntimes) {
      const redisData = redisMetrics.get(rt.id)
      const redisLastSeen = redisData?.lastSeenAt ? new Date(redisData.lastSeenAt) : null
      const pgLastSeen = rt.last_seen_at ? new Date(rt.last_seen_at) : null

      // Use the fresher of Redis vs Postgres
      const lastSeen = (redisLastSeen && pgLastSeen)
        ? (redisLastSeen > pgLastSeen ? redisLastSeen : pgLastSeen)
        : (redisLastSeen || pgLastSeen)

      if (deriveRuntimePresenceStatus(lastSeen, now.getTime()) !== 'connected') {
        trulyStaleIds.push(rt.id)
      }
    }
  }

  // Step 4: Update only truly stale runtimes
  let staleCount = 0
  if (trulyStaleIds.length > 0) {
    const { data } = await supabase
      .from('dedicated_runtimes')
      .update({ status: 'stale' })
      .in('id', trulyStaleIds)
      .eq('status', 'connected')
      .select('id')
    staleCount = data?.length ?? 0
  }

  // Step 5: Existing stale → offline transition (Postgres-only is fine here, 1hr threshold)
  const { data: offlineRuntimes } = await supabase
    .from('dedicated_runtimes')
    .update({ status: 'offline' })
    .eq('status', 'stale')
    .lt('last_seen_at', offlineBefore.toISOString())
    .select('id, org_id, display_name')

  let eventsInserted = 0
  const updated = staleCount + (offlineRuntimes?.length ?? 0)

  // Emit feed events for newly offline runtimes
  if (offlineRuntimes && offlineRuntimes.length > 0) {
    const events = offlineRuntimes.map((rt) => ({
      runtime_id: rt.id,
      org_id: rt.org_id,
      agent_id: null,
      event_type: 'error',
      severity: 'warning',
      payload: {
        type: 'runtime_offline',
        runtimeName: rt.display_name,
        message: `Runtime '${rt.display_name}' has been offline for over 1 hour`,
      },
    }))

    const { error } = await supabase.from('runtime_events').insert(events)
    if (!error) {
      eventsInserted = events.length
    }
  }

  return { updated, eventsInserted }
}

/**
 * Emit a reconnection event when a runtime comes back online.
 * Called from heartbeat processing when status transitions from stale/offline → connected.
 */
export async function emitRuntimeReconnectedEvent(
  runtimeId: string,
  orgId: string,
  displayName: string
): Promise<void> {
  await supabase.from('runtime_events').insert({
    runtime_id: runtimeId,
    org_id: orgId,
    agent_id: null,
    event_type: 'run_started',
    severity: 'info',
    payload: {
      type: 'runtime_reconnected',
      runtimeName: displayName,
      message: `Runtime '${displayName}' reconnected`,
    },
  })
}

// ─── Phone-Home DB Helpers ───

export async function upsertRuntimeCosts(
  orgId: string,
  data: { agentId: string; runId: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number }
): Promise<{ error?: string }> {
  const today = new Date().toISOString().split('T')[0]

  const { data: existing, error: existingError } = await supabase
    .from('mc_agent_cost_tracking')
    .select('tokens_input, tokens_output, estimated_cost_usd, run_count')
    .eq('agent_id', data.agentId)
    .eq('date', today)
    .maybeSingle()

  if (existingError) {
    ErrorService.captureException(existingError, {
      severity: 'error',
      context: { endpoint: 'upsertRuntimeCosts', agentId: data.agentId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { error: existingError.message }
  }

  const row = {
    agent_id: data.agentId,
    org_id: orgId,
    date: today,
    tokens_input: ((existing as { tokens_input?: number } | null)?.tokens_input ?? 0) + data.inputTokens,
    tokens_output: ((existing as { tokens_output?: number } | null)?.tokens_output ?? 0) + data.outputTokens,
    estimated_cost_usd:
      ((existing as { estimated_cost_usd?: number } | null)?.estimated_cost_usd ?? 0) + data.estimatedCostUsd,
    run_count: ((existing as { run_count?: number } | null)?.run_count ?? 0) + 1,
  }

  const { error } = await supabase.from('mc_agent_cost_tracking').upsert(row, { onConflict: 'agent_id,date' })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'upsertRuntimeCosts', agentId: data.agentId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { error: error.message }
  }

  return {}
}

export async function insertRuntimeHealthScore(
  orgId: string,
  data: { agentId: string; overallScore: number; dimensions: Record<string, number> }
): Promise<{ error?: string }> {
  const { error } = await supabase.from('mc_agent_health_scores').insert({
    agent_id: data.agentId,
    org_id: orgId,
    overall_score: data.overallScore,
    dimensions: data.dimensions,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'insertRuntimeHealthScore', agentId: data.agentId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { error: error.message }
  }

  return {}
}

export async function getApprovalStatus(
  approvalId: string,
  orgId: string
): Promise<{ status: string; resolvedAt: string | null } | null> {
  const { data, error } = await supabase
    .from('mc_pending_approvals')
    .select('status, resolved_at')
    .eq('id', approvalId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return null

  return {
    status: data.status,
    resolvedAt: data.resolved_at,
  }
}

// ─── Receipt Events ───

export async function insertReceiptEvent(params: {
  agentId: string
  orgId: string
  eventType: 'receipt_created' | 'receipt_verified' | 'passport_provisioned' | 'epoch_anchored'
  runId?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('mc_receipt_events').insert({
    agent_id: params.agentId,
    org_id: params.orgId,
    event_type: params.eventType,
    run_id: params.runId ?? null,
    payload: params.payload ?? {},
  })

  if (error) {
    // Non-critical — don't let feed event failures affect the caller
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'insertReceiptEvent', ...params },
      tags: { layer: 'db', route: 'mission-control' },
    })
  }
}

// ─── Scheduled Tasks ───

const SCHEDULED_TASK_COLUMNS = [
  'id',
  'assistant_id',
  'org_id',
  'name',
  'description',
  'task_prompt',
  'cron_expression',
  'timezone',
  'run_at',
  'status',
  'last_run_at',
  'last_error',
  'next_run_at',
  'run_count',
  'retry_count',
  'max_retries',
  'enabled',
  'webhook_url',
  'task_kind',
  'target_type',
  'target_id',
  'team_id',
  'project_id',
  'work_item_id',
  'trigger_kind',
  'trigger_config',
  'concurrency_policy',
  'catch_up_policy',
  'catch_up_limit',
  'runtime_selector',
  'capability_requirements',
  'source_kind',
  'managed_resource_id',
  'last_run_status',
  'created_at',
  'updated_at',
].join(', ')

const SCHEDULED_TASK_VERSION_COLUMNS = [
  'id',
  'task_id',
  'org_id',
  'assistant_id',
  'version',
  'change_type',
  'summary',
  'snapshot',
  'snapshot_hash',
  'restored_from_version_id',
  'created_by_user_id',
  'created_at',
].join(', ')

function mapScheduledTaskVersion(row: Record<string, unknown>): ScheduledTaskVersion {
  const snapshot = buildScheduledTaskDefinitionSnapshot(row.snapshot as Record<string, unknown>)
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    org_id: row.org_id as string,
    assistant_id: (row.assistant_id as string | null) ?? null,
    version: Number(row.version ?? 0),
    change_type: row.change_type as ScheduledTaskVersionChangeType,
    summary: (row.summary as string | null) ?? null,
    snapshot,
    snapshot_hash: buildScheduledTaskSnapshotHash(snapshot),
    restored_from_version_id: (row.restored_from_version_id as string | null) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

async function getLatestScheduledTaskVersion(taskId: string): Promise<ScheduledTaskVersion | null> {
  const { data, error } = await supabase
    .from('agent_scheduled_task_versions')
    .select(SCHEDULED_TASK_VERSION_COLUMNS)
    .eq('task_id', taskId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { endpoint: 'getLatestScheduledTaskVersion', taskId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return data ? mapScheduledTaskVersion(data as unknown as Record<string, unknown>) : null
}

export async function recordScheduledTaskVersion(params: {
  task: ScheduledTask
  changeType: ScheduledTaskVersionChangeType
  summary?: string | null
  actorUserId?: string | null
  restoredFromVersionId?: string | null
}): Promise<void> {
  const snapshot = buildScheduledTaskDefinitionSnapshot(params.task)
  const snapshotHash = buildScheduledTaskSnapshotHash(snapshot)
  const latest = await getLatestScheduledTaskVersion(params.task.id)

  if (latest?.snapshot_hash === snapshotHash && params.changeType !== 'restored') {
    return
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const version = (latest?.version ?? 0) + attempt + 1
    const { error } = await supabase
      .from('agent_scheduled_task_versions')
      .insert({
        task_id: params.task.id,
        org_id: params.task.org_id,
        assistant_id: params.task.assistant_id,
        version,
        change_type: params.changeType,
        summary: params.summary ?? null,
        snapshot,
        snapshot_hash: snapshotHash,
        restored_from_version_id: params.restoredFromVersionId ?? null,
        created_by_user_id: params.actorUserId ?? null,
      })

    if (!error) return
    if (error.code !== '23505') {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: {
          endpoint: 'recordScheduledTaskVersion',
          taskId: params.task.id,
          changeType: params.changeType,
          attempt,
        },
        tags: { layer: 'db', route: 'mission-control' },
      })
      return
    }
  }

  ErrorService.captureMessage('Failed to record scheduled task version after retries', {
    severity: 'warning',
    context: { endpoint: 'recordScheduledTaskVersion', taskId: params.task.id },
    tags: { layer: 'db', route: 'mission-control' },
  })
}

async function getScheduledTaskById(taskId: string, orgId: string): Promise<ScheduledTask | null> {
  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .select(SCHEDULED_TASK_COLUMNS)
    .eq('id', taskId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'getScheduledTaskById', taskId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return null
  }

  return data as ScheduledTask | null
}

export async function listScheduledTaskVersions(options: {
  orgId: string
  taskId: string
  limit?: number
}): Promise<ScheduledTaskVersion[]> {
  const { orgId, taskId, limit = 20 } = options
  const { data, error } = await supabase
    .from('agent_scheduled_task_versions')
    .select(SCHEDULED_TASK_VERSION_COLUMNS)
    .eq('org_id', orgId)
    .eq('task_id', taskId)
    .order('version', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'listScheduledTaskVersions', orgId, taskId },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return []
  }

  return (data ?? []).map((row) => mapScheduledTaskVersion(row as unknown as Record<string, unknown>))
}

export interface RestoreScheduledTaskVersionResult {
  task: ScheduledTask | null
  conflict: boolean
  currentSnapshotHash?: string
}

export async function restoreScheduledTaskVersion(input: {
  orgId: string
  taskId: string
  versionId: string
  actorUserId?: string | null
  expectedCurrentSnapshotHash?: string | null
}): Promise<RestoreScheduledTaskVersionResult> {
  const { data: versionRow, error: versionError } = await supabase
    .from('agent_scheduled_task_versions')
    .select(SCHEDULED_TASK_VERSION_COLUMNS)
    .eq('id', input.versionId)
    .eq('task_id', input.taskId)
    .eq('org_id', input.orgId)
    .maybeSingle()

  if (versionError) {
    ErrorService.captureException(versionError, {
      severity: 'error',
      context: { endpoint: 'restoreScheduledTaskVersion.version', ...input },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { task: null, conflict: false }
  }

  if (!versionRow) return { task: null, conflict: false }

  const version = mapScheduledTaskVersion(versionRow as unknown as Record<string, unknown>)
  if (input.expectedCurrentSnapshotHash) {
    const current = await getScheduledTaskById(input.taskId, input.orgId)
    if (!current) return { task: null, conflict: false }

    const currentSnapshotHash = buildScheduledTaskSnapshotHash(current)
    if (currentSnapshotHash !== input.expectedCurrentSnapshotHash) {
      return {
        task: null,
        conflict: true,
        currentSnapshotHash,
      }
    }
  }

  const { data, error } = await supabase
    .from('agent_scheduled_tasks')
    .update(buildScheduledTaskRestorePatch(version.snapshot))
    .eq('id', input.taskId)
    .eq('org_id', input.orgId)
    .select(SCHEDULED_TASK_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: 'restoreScheduledTaskVersion.update', ...input },
      tags: { layer: 'db', route: 'mission-control' },
    })
    return { task: null, conflict: false }
  }

  const task = data as unknown as ScheduledTask | null
  if (!task) return { task: null, conflict: false }

  await recordScheduledTaskVersion({
    task,
    changeType: 'restored',
    summary: `Restored from version ${version.version}`,
    actorUserId: input.actorUserId ?? null,
    restoredFromVersionId: version.id,
  })

  return { task, conflict: false }
}

// ─── Deploy Intent Fulfillment ───

/**
 * Fulfill a deploy intent: create the assistant when the runtime connects.
 *
 * Race-safe: claim-first pattern. The atomic UPDATE to 'fulfilling' acts as a
 * distributed lock. Only one heartbeat wins the claim; losers see 0 rows updated
 * and return null. This prevents duplicate assistant creation.
 *
 * Flow: claim (pending→fulfilling) → create assistant → confirm (fulfilling→fulfilled)
 *
 * Called from the heartbeat API route — NOT from the worker.
 */
export async function fulfillDeployIntent(
  runtimeId: string,
  orgId: string,
): Promise<{ assistantId: string } | null> {
  // Lazy-import to avoid circular dependency (db/index.ts ↔ db/mission-control.ts)
  const { createAssistant, getWorkspace } = await import('@/lib/db')
  const { ensureAssistantPassport } = await import('@/lib/ai/passports')
  const { deployProjectBlueprint } = await import('@/lib/projects/blueprint-deploy')
  const { ProjectBlueprintSchema } = await import('@contracts/project-blueprint')

  // 1. Atomic claim — only one heartbeat wins this race
  //    Transitions: pending → fulfilling (acts as distributed lock)
  const { data: claimed, error: claimError } = await supabase
    .from('dedicated_runtimes')
    .update({ intent_status: 'fulfilling' })
    .eq('id', runtimeId)
    .eq('intent_status', 'pending')
    .select('pending_agent_name, pending_agent_user_id, pending_agent_config, engine')

  if (claimError || !claimed || claimed.length === 0) {
    // Another heartbeat won, or no pending intent — nothing to do
    return null
  }

  const intent = claimed[0]
  if (!intent.pending_agent_name) return null

  try {
    // 2. Resolve workspace/project scope for the user who initiated the deploy
    const workspace = await getWorkspace(intent.pending_agent_user_id, orgId)
    if (!workspace) {
      throw new Error(`Could not resolve workspace for user ${intent.pending_agent_user_id} in org ${orgId}`)
    }

    // 3. Create the assistant or execute the canonical blueprint
    const config = (intent.pending_agent_config ?? {}) as Record<string, unknown>
    const blueprint = ProjectBlueprintSchema.safeParse(config.blueprint)
    if (!blueprint.success && (!workspace.project?.id || !workspace.env?.id)) {
      throw new Error('Runtime deploy requires an existing project scope')
    }

    const assistant = blueprint.success
      ? await (async () => {
          const shouldCreateProject = config.createProject === true && !workspace.project?.id
          const result = await deployProjectBlueprint(blueprint.data, orgId, intent.pending_agent_user_id, {
            ...(workspace.project?.id && !shouldCreateProject ? { projectId: workspace.project.id } : {}),
            ...(shouldCreateProject ? { createProject: true } : {}),
            runtimeId,
          })

          if (result.primary.kind !== 'agent' || !result.primary.assistantId) {
            throw new Error('Runtime deploy blueprint did not create a primary assistant')
          }

          return { id: result.primary.assistantId }
        })()
      : await createAssistant({
          orgId,
          projectId: workspace.project!.id,
          envId: workspace.env!.id,
          name: intent.pending_agent_name,
          runtimeId,
          ...((intent.engine === 'openclaw' || intent.engine === 'hermes')
            ? { engine: intent.engine }
            : {}),
          ...(config.systemPrompt ? { systemPrompt: config.systemPrompt as string } : {}),
          ...(config.lucidModel ? { lucidModel: config.lucidModel as string } : {}),
        })

    // 4. Confirm fulfillment — mark as done
    await supabase
      .from('dedicated_runtimes')
      .update({
        created_assistant_id: assistant.id,
        intent_status: 'fulfilled',
        intent_fulfilled_at: new Date().toISOString(),
      })
      .eq('id', runtimeId)
      .eq('intent_status', 'fulfilling')

    // 5. Provision passport (non-blocking, best-effort)
    ensureAssistantPassport({
      assistantId: assistant.id,
      existingPassportId: null,
      name: intent.pending_agent_name,
      orgId,
    }).catch((err) => {
      ErrorService.captureException(err, {
        severity: 'warning',
        context: { endpoint: 'fulfillDeployIntent:passport', runtimeId, assistantId: assistant.id },
        tags: { layer: 'db', route: 'mission-control' },
      })
    })

    return { assistantId: assistant.id }
  } catch (err) {
    // Revert claim → failed (not back to pending — prevents infinite retry loops)
    await supabase
      .from('dedicated_runtimes')
      .update({
        intent_status: 'failed',
        intent_error: err instanceof Error ? err.message : String(err),
      })
      .eq('id', runtimeId)
      .eq('intent_status', 'fulfilling')

    ErrorService.captureException(err, {
      severity: 'error',
      context: { endpoint: 'fulfillDeployIntent', runtimeId, orgId },
      tags: { layer: 'db', route: 'mission-control' },
    })

    return null
  }
}

// ─── Channel Architecture: REST Message Relay ───

export interface RelayRunPacket {
  eventId: string
  idempotencyToken: string
  channelMeta: {
    channelType: string
    channelId: string
    externalUserId: string
    externalChatId: string
    threadId?: string
  }
  assistantConfig: {
    id: string
    name: string
    engine?: 'openclaw' | 'hermes'
    systemPrompt: string | null
    soulContent: string | null
    runtimeFlavor?: RuntimeFlavor
    modelId: string
    temperature: number
    maxTokens: number
    enabledTools: string[]
    policyConfig: Record<string, unknown>
    memoryEnabled: boolean
    approvalRequiredTools: string[]
    orgId: string
  }
  recentMessages: Array<{
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }>
  memoryInjection: string[]
  boardMemories: string[]
  conversationSummary: string | null
  userMessage: {
    text: string
    externalMessageId: string
    externalUserId: string
    messageData: Record<string, unknown> | null
  }
  skills: Array<{ slug: string; content: string }>
  plugins: Array<{
    slug: string
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  }>
}

// ─── Relay Error Types (typed, no string matching) ───

export class RelayNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'RelayNotFoundError' }
}

export class RelayOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'RelayOwnershipError' }
}

export class RelayDataAccessError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'RelayDataAccessError'
  }
}

/**
 * Claim inbound events for a dedicated runtime and build bounded RunPackets.
 * Server-side only — loads channel, assistant config, messages, memories, skills, plugins.
 */
export async function claimInboundForRuntime(
  runtimeId: string,
  orgId: string,
  batchSize: number
): Promise<RelayRunPacket[]> {
  // 1. Claim events via existing RPC
  const { data: events, error } = await supabase.rpc('claim_next_inbound_event', {
    p_worker_id: `relay-${runtimeId}`,
    p_batch_size: batchSize,
    p_runtime_id: runtimeId,
  })

  if (error || !events?.length) return []

  // 2. Build RunPackets — parallelize per event
  const packets = await Promise.allSettled(
    events.map((event: Record<string, unknown>) =>
      buildRunPacket(event, orgId)
    )
  )

  // Log rejected packets for observability
  const rejected = packets.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
  for (const r of rejected) {
    ErrorService.captureException(r.reason instanceof Error ? r.reason : new Error(String(r.reason)), {
      severity: 'error',
      context: { endpoint: 'claimInboundForRuntime:buildRunPacket', runtimeId },
      tags: { layer: 'db', route: 'runtimes' },
    })
  }

  return packets
    .filter((r): r is PromiseFulfilledResult<RelayRunPacket> => r.status === 'fulfilled')
    .map(r => r.value)
}

async function buildRunPacket(
  event: Record<string, unknown>,
  orgId: string
): Promise<RelayRunPacket> {
  const eventId = event.id as string
  const channelId = event.channel_id as string
  const crypto = await import('crypto')
  const idempotencyToken = `${eventId}:${crypto.randomUUID()}`

  // Load channel + assistant config (single query with join)
  const { data: channel } = await supabase
    .from('assistant_channels')
    .select(`
      id, channel_type, external_channel_id, channel_config,
      encrypted_secrets:encrypted_secrets_id (
        encrypted_data
      ),
      assistant:ai_assistants!inner (
        id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens,
        memory_enabled, approval_required_tools, policy_config, org_id, project_id, runtime_flavor
      )
    `)
    .eq('id', channelId)
    .single()

  if (!channel?.assistant) {
    throw new Error(`Channel ${channelId} not found or assistant missing`)
  }

  // Supabase !inner JOIN returns array with single element — extract it
  const assistantRaw = Array.isArray(channel.assistant) ? channel.assistant[0] : channel.assistant
  const assistant = assistantRaw as unknown as Record<string, unknown>
  const assistantId = assistant.id as string
  const typedChannel = channel as Record<string, unknown>

  // SECURITY: Verify org ownership — prevent cross-tenant data leakage
  if (String(assistant.org_id) !== orgId) {
    throw new RelayOwnershipError(`Assistant ${assistantId} does not belong to org ${orgId}`)
  }

  const conversationId = await getOrCreateConversation(
    assistantId,
    channelId,
    event.external_user_id as string | null | undefined,
    event.external_chat_id as string | null | undefined,
  )

  // Parallel: messages, memories, skills, plugins, conversation
  const [messagesRes, memoriesRes, skillsRes, pluginsRes, conversationRes, boardMemoriesRes, projectLearningsRes] = await Promise.all([
    // Recent messages (last 20)
    supabase
      .from('assistant_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20),

    // Memories (last 10 by access time)
    supabase.rpc('get_recent_memories_v2', {
      p_assistant_id: assistantId,
      p_scoped_user_id: buildScopedUserId(
        String(assistant.org_id),
        event.external_user_id as string | null | undefined,
        assistant.project_id as string | null | undefined,
      ),
      p_limit: 10,
    }),

    // Active skills
    supabase.rpc('get_assistant_active_skills', { p_assistant_id: assistantId }),

    // Active plugins
    supabase.rpc('get_assistant_active_plugins', { p_assistant_id: assistantId }),

    // Conversation summary
    supabase
      .from('assistant_conversation_summaries')
      .select('summary')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),

    // Board memories (org-level shared knowledge)
    supabase.rpc('get_board_memories', { p_org_id: orgId, p_limit: 10 }),

    // Project learnings scoped to this assistant. They share the board-memory
    // prompt seam so the runtime stays engine-agnostic.
    supabase
      .from('project_learnings')
      .select('learning_type, trust_level, title, body, confidence')
      .eq('org_id', orgId)
      .eq('assistant_id', assistantId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  const recentMessages = (messagesRes.data || [])
    .reverse()
    .map((m: Record<string, unknown>) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : '',
      createdAt: m.created_at as string,
    }))

  const memoryInjection = (memoriesRes.data || [])
    .map((m: Record<string, unknown>) => m.content as string)
    .filter(Boolean)

  // Board memories — org-level shared knowledge, prefixed with category
  // Log RPC errors but continue without board memories (non-fatal)
  if (boardMemoriesRes.error) {
    console.warn('[buildRunPacket] Board memory RPC failed:', boardMemoriesRes.error.message)
  }
  if (projectLearningsRes.error) {
    console.warn('[buildRunPacket] Project learning load failed:', projectLearningsRes.error.message)
  }
  // Enforce 8K aggregate cap matching board-memory-loader.ts
  // Strip XML-breaking sequences matching board-memory-loader.ts
  const MAX_BOARD_MEMORY_CHARS = 8_000
  const boardMemories: string[] = []
  let boardMemoryChars = 0
  for (const m of (boardMemoriesRes.data || []) as Array<Record<string, unknown>>) {
    const safeContent = String(m.content || '').replace(/<\/org_knowledge>/gi, '')
    const formatted = `[${m.category}] ${safeContent}`
    if (!formatted || boardMemoryChars + formatted.length > MAX_BOARD_MEMORY_CHARS) break
    boardMemories.push(formatted)
    boardMemoryChars += formatted.length
  }
  const projectLearningContext = buildProjectLearningPromptContext(
    ((projectLearningsRes.data || []) as Array<Record<string, unknown>>).map((learning) => ({
      type: String(learning.learning_type || 'operational'),
      trustLevel: String(learning.trust_level || 'observed'),
      title: String(learning.title || 'Project learning'),
      body: String(learning.body || ''),
      confidence: Number(learning.confidence ?? 0.7),
    })),
  )
  boardMemories.push(...projectLearningContext)

  const skills = (skillsRes.data || []).map((s: Record<string, unknown>) => ({
    slug: s.slug as string,
    content: s.sanitized_content as string || s.content as string || '',
  }))

  const plugins = (pluginsRes.data || []).map((p: Record<string, unknown>) => ({
    slug: p.plugin_slug as string || p.slug as string,
    tools: ((p.enabled_tools || p.tool_manifest || []) as Array<Record<string, unknown>>).map(t => ({
      name: t.name as string,
      description: (t.description || '') as string,
      parameters: (t.parameters || {}) as Record<string, unknown>,
    })),
  }))

  let effectiveUserMessageText = (event.message_text as string) || ''

  if (channel.channel_type === 'telegram') {
    const messageData =
      (event.message_data as Record<string, unknown> | null | undefined) ?? null
    const attachments = Array.isArray(messageData?.attachments)
      ? (messageData.attachments as TelegramInboundAttachmentRef[])
      : []

    if (attachments.length > 0) {
      let botToken: string | undefined

      const encryptedSecrets =
        typedChannel.encrypted_secrets && typeof typedChannel.encrypted_secrets === 'object'
          ? typedChannel.encrypted_secrets as { encrypted_data?: string | null }
          : null
      if (typeof encryptedSecrets?.encrypted_data === 'string' && encryptedSecrets.encrypted_data) {
        botToken = decryptChannelSecrets(encryptedSecrets.encrypted_data).bot_token
      }

      const channelConfig =
        typedChannel.channel_config && typeof typedChannel.channel_config === 'object'
          ? typedChannel.channel_config as Record<string, unknown>
          : null
      if (!botToken && channelConfig?.hosted === true) {
        botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
      }

      const mediaProviderConfig = getMediaProviderConfig()
      const resolved = await resolveTelegramIngress({
        messageText: effectiveUserMessageText || null,
        attachments,
        botToken,
        llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
        llmApiKey: mediaProviderConfig.preferredGatewayApiKey,
        llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
        llmApiKeys: mediaProviderConfig.gatewayApiKeys,
      })
      console.log('[completeInboundForRuntime] telegram ingress resolved', {
        eventId,
        attachments: attachments.length,
        hasBotToken: Boolean(botToken),
        hosted: channelConfig?.hosted === true,
        resolvedTextLength: resolved.messageText?.length ?? 0,
        resolvedTextPreview: resolved.messageText?.slice(0, 120) ?? null,
      })
      effectiveUserMessageText = resolved.messageText ?? ''
    }
  }

  return {
    eventId,
    idempotencyToken,
    channelMeta: {
      channelType: channel.channel_type,
      channelId: channel.id,
      externalUserId: event.external_user_id as string,
      externalChatId: event.external_chat_id as string,
    },
    assistantConfig: {
      id: assistantId,
      name: assistant.name as string,
      engine: assistant.engine === 'hermes' ? 'hermes' : 'openclaw',
      systemPrompt: assistant.system_prompt as string | null,
      soulContent: (assistant.soul_content as string | null) ?? null,
      runtimeFlavor: mapRuntimeFlavor(
        (assistant.runtime_flavor as RuntimeFlavor | null | undefined) ?? null,
        'relay',
      ),
      modelId: assistant.lucid_model as string,
      temperature: Number(assistant.temperature || 0.7),
      maxTokens: Number(assistant.max_tokens || 4096),
      enabledTools: [],
      policyConfig: (assistant.policy_config || {}) as Record<string, unknown>,
      memoryEnabled: Boolean(assistant.memory_enabled),
      approvalRequiredTools: (assistant.approval_required_tools || []) as string[],
      orgId,
    },
    recentMessages,
    memoryInjection,
    boardMemories,
    conversationSummary: (conversationRes.data as Record<string, unknown> | null)?.summary as string | null ?? null,
    userMessage: {
      text: effectiveUserMessageText,
      externalMessageId: event.external_message_id as string,
      externalUserId: event.external_user_id as string,
      messageData: event.message_data as Record<string, unknown> | null,
    },
    skills,
    plugins,
  }
}

/**
 * Build a RunPacket for a specific event by ID.
 * Used by Pulse claim proxy — Pulse claims from Redis, then this builds the packet.
 * Claims the event in DB (status: pending → claimed) as part of packet building.
 *
 * Returns null if event not found, already processed, or org mismatch.
 */
export async function buildRunPacketById(
  eventId: string,
  runtimeId: string,
  orgId: string,
): Promise<RelayRunPacket | null> {
  // 1. Load and atomically claim the event
  const { data: events, error: loadError } = await supabase
    .from('assistant_inbound_events')
    .select(RELAY_INBOUND_EVENT_SELECT)
    .eq('id', eventId)
    .in('status', ['pending', 'claimed'])
    .limit(1)

  if (loadError || !events?.length) return null

  const event = events[0] as Record<string, unknown>

  // 2. Mark as processing (optimistic lock via WHERE status check)
  // Must use 'processing' — completeInboundForRuntime expects this status
  const { error: claimError } = await supabase
    .from('assistant_inbound_events')
    .update({
      status: 'processing',
      worker_id: `relay-${runtimeId}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .in('status', ['pending', 'claimed'])

  if (claimError) {
    console.warn('[buildRunPacketById] Failed to claim event:', claimError.message)
    return null
  }

  // 3. Build the RunPacket (same logic as buildRunPacket)
  try {
    return await buildRunPacket(event, orgId)
  } catch (err) {
    // Release the claim if packet building fails
    await supabase
      .from('assistant_inbound_events')
      .update({ status: 'pending', worker_id: null })
      .eq('id', eventId)
    throw err
  }
}

/**
 * Complete an inbound event: store messages, create outbound, deliver synchronously.
 * Idempotent: eventId + runId dedup.
 */
export async function completeInboundForRuntime(
  runtimeId: string,
  orgId: string,
  payload: {
    eventId: string
    runId: string
    responseText: string
    resolvedUserMessageText?: string
    outputArtifacts?: Array<{ toolName: string; result: string }>
    tokenUsage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
  }
): Promise<{
  alreadyApplied: boolean
  delivered: boolean
  externalMessageId?: string
  channelType?: string
  deliveryError?: string
}> {
  const { eventId, runId, responseText, tokenUsage, resolvedUserMessageText } = payload

  // 1. Load event + verify ownership
  const eventSelect = `
      id, status, channel_id, external_user_id, external_chat_id,
      external_message_id, message_text, message_data, assistant_id,
      channel:assistant_channels!inner (
        id, channel_type, external_channel_id, channel_config,
        encrypted_secrets:encrypted_secrets_id (
          encrypted_data
        ),
        assistant_id,
        assistant:ai_assistants!inner ( id, runtime_id, org_id )
      )
    `

  const { data: event, error: loadError } = await supabase
    .from('assistant_inbound_events')
    .select(eventSelect)
    .eq('id', eventId)
    .single()

  if (loadError) {
    throw new RelayDataAccessError(`Failed to load event ${eventId}`, loadError)
  }

  if (!event) {
    throw new RelayNotFoundError(`Event ${eventId} not found`)
  }

  const channelRaw = Array.isArray(event.channel) ? event.channel[0] : event.channel
  const channel = channelRaw as unknown as Record<string, unknown>
  const assistantRaw2 = Array.isArray(channel.assistant) ? channel.assistant[0] : channel.assistant
  const assistant = assistantRaw2 as unknown as Record<string, unknown>

  // Verify ownership — typed error for route-level handling
  if (String(assistant.runtime_id) !== runtimeId || String(assistant.org_id) !== orgId) {
    throw new RelayOwnershipError(`Event ${eventId} does not belong to runtime ${runtimeId}`)
  }

  // 2. Idempotency check
  if (event.status === 'done') {
    return { alreadyApplied: true, delivered: true }
  }

  // 3. Get or create conversation
  const conversationId = await getOrCreateConversation(
    assistant.id as string,
    event.channel_id as string,
    event.external_user_id as string | null | undefined,
    event.external_chat_id as string,
  )

  // 4. Store messages
  const crypto = await import('crypto')
  const userMsgId = crypto.randomUUID()
  const assistantMsgId = crypto.randomUUID()
  let effectiveUserMessageText =
    typeof resolvedUserMessageText === 'string'
      ? resolvedUserMessageText
      : ((event.message_text as string) || '')

  if (!resolvedUserMessageText && channel.channel_type === 'telegram') {
    const messageData =
      (event.message_data as Record<string, unknown> | null | undefined) ?? null
    const attachments = Array.isArray(messageData?.attachments)
      ? (messageData.attachments as TelegramInboundAttachmentRef[])
      : []

    if (attachments.length > 0) {
      let botToken: string | undefined

      const encryptedSecrets =
        channel.encrypted_secrets && typeof channel.encrypted_secrets === 'object'
          ? channel.encrypted_secrets as { encrypted_data?: string | null }
          : null
      if (typeof encryptedSecrets?.encrypted_data === 'string' && encryptedSecrets.encrypted_data) {
        botToken = decryptChannelSecrets(encryptedSecrets.encrypted_data).bot_token
      }

      const channelConfig =
        channel.channel_config && typeof channel.channel_config === 'object'
          ? channel.channel_config as Record<string, unknown>
          : null
      if (!botToken && channelConfig?.hosted === true) {
        botToken = process.env.TELEGRAM_HOSTED_BOT_TOKEN
      }

      const mediaProviderConfig = getMediaProviderConfig()
      const resolved = await resolveTelegramIngress({
        messageText: effectiveUserMessageText || null,
        attachments,
        botToken,
        llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
        llmApiKey: mediaProviderConfig.preferredGatewayApiKey,
        llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
        llmApiKeys: mediaProviderConfig.gatewayApiKeys,
      })
      effectiveUserMessageText = resolved.messageText ?? ''
    }
  }

  const { error: msgError } = await supabase.from('assistant_messages').insert([
    {
      id: userMsgId,
      conversation_id: conversationId,
      role: 'user',
      content: effectiveUserMessageText,
    },
    {
      id: assistantMsgId,
      conversation_id: conversationId,
      role: 'assistant',
      content: responseText,
    },
  ])
  if (msgError) throw new Error(`Failed to store messages: ${msgError.message}`)

  // 5. Mark inbound done atomically — WHERE status='processing' prevents race conditions
  const { data: updated, error: updateError } = await supabase
    .from('assistant_inbound_events')
    .update({
      status: 'done',
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('status', 'processing')
    .select('id')

  if (updateError) throw new Error(`Failed to mark inbound done: ${updateError.message}`)
  if (!updated?.length) {
    // Another worker already processed — idempotent return
    return { alreadyApplied: true, delivered: true }
  }

  // 6. Create outbound event
  const { data: outbound, error: outboundError } = await supabase
    .from('assistant_outbound_events')
    .insert({
      channel_id: event.channel_id,
      conversation_id: conversationId,
      message_text: responseText,
      reply_to_external_id: event.external_message_id,
      inbound_event_id: eventId,
    })
    .select('id')
    .single()
  if (outboundError) throw new Error(`Failed to create outbound: ${outboundError.message}`)

  // 7. Deliver synchronously (server has ENCRYPTION_KEY)
  let delivered = false
  let externalMessageId: string | undefined
  let deliveryError: string | undefined
  const channelType = channel.channel_type as string

  try {
    const { deliverOutbound } = await import('./outbound-delivery')
    const result = await deliverOutbound(
      event.channel_id as string,
      responseText,
      event.external_message_id as string | null,
    )
    delivered = result.delivered
    externalMessageId = result.externalMessageId ?? undefined

    // Mark outbound sent
    if (outbound?.id && delivered) {
      await supabase
        .from('assistant_outbound_events')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          external_message_id: externalMessageId,
        })
        .eq('id', outbound.id)
    }
  } catch (err) {
    deliveryError = err instanceof Error ? err.message : String(err)
    // Leave outbound as pending — shared worker will retry via outbound poll
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { endpoint: 'completeInboundForRuntime:delivery', eventId, channelType },
      tags: { layer: 'db', route: 'runtimes' },
    })
  }

  // 8. Record billing
  if (tokenUsage) {
    await upsertRuntimeCosts(orgId, {
      agentId: assistant.id as string,
      runId,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      estimatedCostUsd: tokenUsage.estimatedCostUsd,
    })
  }

  return { alreadyApplied: false, delivered, externalMessageId, channelType, deliveryError }
}

async function getOrCreateConversation(
  assistantId: string,
  channelId: string,
  externalUserId?: string | null,
  externalChatId?: string | null,
): Promise<string> {
  const normalizeConversationId = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
      return (value as { id: string }).id
    }
    throw new Error('get_or_create_conversation returned an unexpected payload')
  }

  const primaryResult = await supabase.rpc('get_or_create_conversation', {
    p_assistant_id: assistantId,
    p_channel_id: channelId,
    p_external_user_id: externalUserId ?? externalChatId ?? '',
    p_external_chat_id: externalChatId ?? externalUserId ?? '',
  })
  if (primaryResult.error) throw primaryResult.error
  return normalizeConversationId(primaryResult.data)
}

// ─── Linear Agent Sessions ───

interface LinearAgentSessionRow {
  id: string
  org_id: string
  agent_id: string | null
  linear_session_id: string
  linear_issue_id: string
  linear_issue_identifier: string | null
  linear_issue_url: string | null
  status: string
  trigger_type: string
  run_id: string | null
  linear_actor_name: string | null
  signal: string | null
  webhook_received_at: string
  completed_at: string | null
  created_at: string
}

/**
 * Fetch Linear agent sessions for an org with optional status filter.
 * Ordered by created_at DESC. Default limit 50.
 */
export async function getLinearAgentSessions(
  orgId: string,
  options?: { status?: string; limit?: number },
): Promise<LinearAgentSession[]> {
  const limit = options?.limit ?? 50

  let query = supabase
    .from('linear_agent_sessions')
    .select(
      'id, org_id, agent_id, linear_session_id, linear_issue_id, linear_issue_identifier, linear_issue_url, status, trigger_type, run_id, linear_actor_name, signal, webhook_received_at, completed_at, created_at',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'getLinearAgentSessions', org_id: orgId },
      tags: { layer: 'db', table: 'linear_agent_sessions' },
    })
    return []
  }

  return (data ?? []).map((row: LinearAgentSessionRow) => ({
    id: row.id,
    orgId: row.org_id,
    agentId: row.agent_id,
    linearSessionId: row.linear_session_id,
    linearIssueId: row.linear_issue_id,
    linearIssueIdentifier: row.linear_issue_identifier,
    linearIssueUrl: row.linear_issue_url,
    status: row.status as LinearAgentSession['status'],
    triggerType: row.trigger_type as LinearAgentSession['triggerType'],
    runId: row.run_id,
    linearActorName: row.linear_actor_name,
    signal: row.signal,
    webhookReceivedAt: row.webhook_received_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }))
}
