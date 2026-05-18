/**
 * Mission Control — Shared TypeScript Types
 */

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
  RuntimeNativeCapability,
  RuntimeServiceDescriptor,
  RuntimeTranscriptParserStatus,
} from '@contracts/runtime-capability'

// ─── Agent Types ───

export type AgentStatus = 'active' | 'paused' | 'stopped' | 'failed'

/** Real-time presence state for agent storytelling UI */
export type AgentPresenceState = 'idle' | 'receiving' | 'thinking' | 'tool-calling' | 'responding'

/** Chat status from Vercel AI SDK useChat() */
export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

/** Derived agent presence — output of useAgentPresence() */
export interface AgentPresence {
  state: AgentPresenceState
  lastActivityAt: Date | null
  lastActivityLabel: string
  sparklineData: number[]
  connected: boolean
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface MCAgent {
  id: string
  name: string
  description: string | null
  projectSlug?: string | null
  projectName?: string | null
  status: AgentStatus
  lucid_model: string
  is_active: boolean
  org_id: string
  approval_required_tools: string[]
  /** Cost in USD today */
  cost_today_usd: number
  /** Errors in last hour */
  errors_last_hour: number
  /** Last activity timestamp */
  last_active_at: string | null
  /** Computed risk level */
  risk_level: RiskLevel
  /** Health score 0-100 (null if not computed yet) */
  health_score?: number | null
  /** Pending approval count */
  pending_approvals?: number
  /** Runtime info (present when agent runs on a dedicated runtime) */
  runtime?: MCAgentRuntimeInfo
}

export interface MCAgentContext {
  agent: MCAgent
  /** Current/last run ID */
  current_run_id: string | null
  /** Last error message */
  last_error: string | null
  /** Active trading policy summary */
  policy_summary: string | null
  /** Recent memories (last 5) */
  recent_memories: Array<{
    id: string
    content: string
    category: string
    importance: number
  }>
  /** Pending approval count */
  pending_approvals_count: number
  /** Connected channels */
  channels: Array<{
    id: string
    channel_type: string
    is_active: boolean
  }>
}

// ─── Feed Event Types ───

export type FeedEventType =
  | 'tool_call'
  | 'tool_result'
  | 'native_mutation_candidate'
  | 'error'
  | 'runtime_migration_started'
  | 'runtime_migration_completed'
  | 'runtime_migration_failed'
  | 'channel_connected'
  | 'channel_disconnected'
  | 'channel_deactivated'
  | 'approval_requested'
  | 'approval_resolved'
  | 'run_started'
  | 'run_finished'
  | 'agent_paused'
  | 'agent_resumed'
  | 'message_received'
  | 'message_sent'
  | 'transaction_submitted'
  | 'transaction_confirmed'
  | 'transaction_failed'
  | 'remediation_triggered'
  | 'receipt_created'
  | 'receipt_verified'
  | 'passport_provisioned'
  | 'epoch_anchored'
  | 'task_scheduled'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'agent_message_sent'
  | 'subagent_spawned'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'crew_run_started'
  | 'crew_run_completed'
  | 'crew_run_failed'
  | 'crew_member_started'
  | 'crew_member_completed'
  | 'crew_member_failed'
  | 'inbound'
  | 'outbound'

export type FeedSeverity = 'info' | 'warn' | 'warning' | 'error' | 'critical'

export interface FeedEvent {
  id: string
  event_type: FeedEventType
  severity: FeedSeverity
  agent_id: string
  agent_name: string
  org_id: string
  run_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

// ─── Approval Types ───

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired'

export interface PendingApproval {
  id: string
  org_id: string
  agent_id: string
  agent_name: string
  run_id: string
  tool_name: string
  tool_args: Record<string, unknown>
  estimated_cost_usd: number | null
  risk_level: RiskLevel
  status: ApprovalStatus
  requested_at: string
  expires_at: string
}

export interface ApprovalAction {
  approval_id: string
  action: 'approved' | 'denied'
  reason?: string
}

// ─── Scheduled Task Types ───

export type ScheduledTaskStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'dead_letter' | 'cancelled'

export interface ScheduledTask {
  id: string
  assistant_id: string
  org_id: string
  name: string
  description: string | null
  task_prompt: string
  cron_expression: string | null
  timezone: string
  run_at: string | null
  status: ScheduledTaskStatus
  last_run_at: string | null
  last_error: string | null
  next_run_at: string | null
  run_count: number
  retry_count: number
  max_retries: number
  enabled: boolean
  webhook_url: string | null
  task_kind?: string | null
  target_type?: string | null
  target_id?: string | null
  team_id?: string | null
  project_id?: string | null
  work_item_id?: string | null
  trigger_kind?: string | null
  trigger_config?: Record<string, unknown> | null
  concurrency_policy?: string | null
  catch_up_policy?: string | null
  catch_up_limit?: number | null
  runtime_selector?: Record<string, unknown> | null
  capability_requirements?: Array<Record<string, unknown>> | null
  source_kind?: string | null
  managed_resource_id?: string | null
  last_run_status?: string | null
  created_at: string
  updated_at: string
}

export type ScheduledTaskVersionChangeType = 'created' | 'updated' | 'cancelled' | 'deleted' | 'restored'

export interface ScheduledTaskDefinitionSnapshot {
  schema_version: 'scheduled-task-definition.v1'
  id: string
  assistant_id: string
  org_id: string
  name: string
  description: string | null
  task_prompt: string
  cron_expression: string | null
  timezone: string
  run_at: string | null
  max_retries: number
  enabled: boolean
  webhook_url: string | null
  webhook_url_redacted: boolean
}

export interface ScheduledTaskVersion {
  id: string
  task_id: string
  org_id: string
  assistant_id: string | null
  version: number
  change_type: ScheduledTaskVersionChangeType
  summary: string | null
  snapshot: ScheduledTaskDefinitionSnapshot
  snapshot_hash: string
  restored_from_version_id: string | null
  created_by_user_id: string | null
  created_at: string
}

// ─── L2 Deploy Status ───

export interface L2DeployStatus {
  status: 'deploying' | 'running' | 'stopped' | 'failed' | 'terminated' | 'unknown'
  health?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  url?: string
  error?: string
}

// ─── Runtime Types ───

export type RuntimeProvider = 'railway' | 'akash' | 'phala' | 'io.net' | 'nosana' | 'docker' | 'manual'
export type RuntimeStatus = 'pending' | 'deploying' | 'connected' | 'stale' | 'offline' | 'failed' | 'revoked'
export type ConnectionStatus = 'connected' | 'stale' | 'offline'
export type RuntimeMaintenanceAction = 'reconcile' | 'redeploy' | 'restart' | 'rollback' | 'rehome'
export type RuntimeMaintenanceJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type RuntimeMaintenanceChannel = 'stable' | 'canary' | 'pinned'
export type RuntimeAutoUpdatePolicy = 'manual' | 'patch_auto' | 'security_auto' | 'full_auto'

export interface DedicatedRuntime {
  id: string
  orgId: string
  displayName: string
  description: string | null
  engine: AgentEngine
  provider: RuntimeProvider
  status: RuntimeStatus
  runtimeTier: 'dedicated' | 'byo' | null
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'> | null
  channelOwnership: ChannelOwnership | null
  runtimeProtocol: RuntimeProtocol
  lastSeenAt: string | null
  /** @deprecated Use engineVersion/runtimeVersion. */
  openclawVersion: string | null
  engineVersion: string | null
  runtimeVersion: string | null
  cpuPercent: number | null
  ramPercent: number | null
  diskPercent: number | null
  gpuPercent: number | null
  workerPendingEvents: number
  workerDeadLetters: number
  agentCount: number
  deploymentUrl: string | null
  l2DeploymentId: string | null
  l2PassportId: string | null
  l2PassportOwner: string | null
  l2OwnerMode: 'user_wallet' | 'workspace_custody' | 'platform_default' | null
  l2ClaimStatus: 'claimed' | 'claimable' | null
  l2ClaimedByUserId: string | null
  l2ClaimedAt: string | null
  lastL2Status: string | null
  lastL2Error: string | null
  lastL2CheckedAt: string | null
  managedByLucid: boolean
  maintenanceChannel: RuntimeMaintenanceChannel
  autoUpdatePolicy: RuntimeAutoUpdatePolicy
  currentImageRef: string | null
  currentImageDigest: string | null
  targetImageRef: string | null
  lastSuccessfulImageRef: string | null
  lastMaintenanceAction: RuntimeMaintenanceAction | null
  lastMaintenanceAt: string | null
  lastMaintenanceError: string | null
  createdAt: string
  pendingAgentName?: string | null
  pendingAgentUserId?: string | null
  pendingAgentConfig?: Record<string, unknown> | null
  createdAssistantId?: string | null
  intentStatus?: 'pending' | 'fulfilling' | 'fulfilled' | 'failed' | 'cleaned' | null
  intentError?: string | null
  intentFulfilledAt?: string | null
  envSnapshot?: Record<string, { present: boolean; updatedAt?: string; masked?: boolean; valuePreview?: string }> | null
  healthcheckConfig?: { path: string; intervalSeconds: number; timeoutSeconds: number } | null
  restartPolicy?: 'always' | 'on_failure' | 'never' | null
  /** Channel mode: 'relay' (C1) or 'native' (C2a) or null (not configured) */
  channelMode?: 'relay' | 'native' | null
  /** Dedicated scheduler transport: relay or native Pulse. */
  dedicatedTransportMode?: DedicatedTransportMode | null
  /** C2a: live native channel connection status (reported via heartbeat) */
  nativeChannels?: NativeChannelStatus[] | null
  /** C2a: pending governance actions queue */
  pendingActions?: GovernanceAction[] | null
  /** Hardware specs reported via heartbeat */
  systemInfo?: {
    cpuModel?: string
    cpuCores?: number
    ramTotalGb?: number
    diskTotalGb?: number
    platform?: string
    arch?: string
  } | null
  /** Capability plane: adapter/runtime identity reported through heartbeat */
  adapterIdentity?: RuntimeAdapterIdentity | null
  /** Capability plane: engine-native and adapter-native features */
  nativeCapabilities?: RuntimeNativeCapability[] | null
  /** Capability plane: runtime-owned services such as parsers, bridges, and local daemons */
  runtimeServices?: RuntimeServiceDescriptor[] | null
  /** Capability plane: latest cached adapter environment probe */
  adapterProbe?: RuntimeAdapterProbeSummary | null
  /** Capability plane: transcript parser support and test status */
  transcriptParser?: RuntimeTranscriptParserStatus | null
  /** Capability plane: CLI/local run command spec */
  commandSpec?: RuntimeCommandSpec | null
  /** Capability plane: engine-home/EHV authority and write policy */
  engineHomePolicy?: RuntimeEngineHomePolicy | null
  /** Timestamp for the latest accepted capability report */
  capabilityReportedAt?: string | null
  engineMetadata?: Record<string, unknown> | null
  runtimeBootstrapConfig?: RuntimeBootstrapConfig | null
  /** @deprecated Prefer runtimeBootstrapConfig.migration. */
  migrationConfig?: RuntimeMigrationConfig | null
}

export interface RuntimeMaintenanceJob {
  id: string
  runtimeId: string
  orgId: string
  provider: RuntimeProvider | string
  action: RuntimeMaintenanceAction
  status: RuntimeMaintenanceJobStatus
  targetImageRef: string | null
  targetImageDigest: string | null
  providerOperationId: string | null
  providerDeploymentId: string | null
  requestedBy: string | null
  resultPayload: Record<string, unknown>
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface RuntimeMaintenanceState {
  runtimeId: string
  managedByLucid: boolean
  maintenanceChannel: RuntimeMaintenanceChannel
  autoUpdatePolicy: RuntimeAutoUpdatePolicy
  currentImageRef: string | null
  currentImageDigest: string | null
  targetImageRef: string | null
  lastSuccessfulImageRef: string | null
  lastMaintenanceAction: RuntimeMaintenanceAction | null
  lastMaintenanceAt: string | null
  lastMaintenanceError: string | null
  jobs: RuntimeMaintenanceJob[]
}

export interface NativeChannelStatus {
  channelType: string
  accountId: string
  status: 'connected' | 'reconnecting' | 'error' | 'stopped'
  lastMessageAt?: string
  errorMessage?: string
}

export interface GovernanceAction {
  type: 'pause_channel' | 'resume_channel' | 'stop_all_channels'
  channelType?: string
  accountId?: string
}

// ─── Linear Agent Session Types ───

export type LinearAgentSessionStatus =
  | 'pending'
  | 'active'
  | 'awaiting_input'
  | 'complete'
  | 'error'
  | 'stale'
  | 'cancelled'

export type LinearAgentTriggerType = 'assignment' | 'mention' | 'comment'

export interface LinearAgentSession {
  id: string
  orgId: string
  agentId: string | null
  linearSessionId: string
  linearIssueId: string
  linearIssueIdentifier: string | null
  linearIssueUrl: string | null
  status: LinearAgentSessionStatus
  triggerType: LinearAgentTriggerType
  runId: string | null
  linearActorName: string | null
  signal: string | null
  webhookReceivedAt: string
  completedAt: string | null
  createdAt: string
}

export function getConnectionStatus(lastSeenAt: string | null): ConnectionStatus {
  if (!lastSeenAt) return 'offline'
  const elapsed = Date.now() - new Date(lastSeenAt).getTime()
  if (elapsed < 60_000) return 'connected'
  if (elapsed < 300_000) return 'stale'
  return 'offline'
}

/** Optional runtime info attached to MCAgent when agent runs on a dedicated runtime */
export interface MCAgentRuntimeInfo {
  runtimeId: string | null
  runtimeName: string | null
  runtimeStatus: RuntimeStatus | null
  runtimeProvider: RuntimeProvider | null
}

// ─── Control Types ───

export type ControlAction = 'pause' | 'resume' | 'kill' | 'escalate' | 'nudge'

export interface ControlRequest {
  agent_id: string
  action: ControlAction
  /** For escalate: target model */
  target_model?: string
  /** For kill: run_id to abort */
  run_id?: string
}

export interface ControlResult {
  success: boolean
  message: string
  agent_id: string
  action: ControlAction
}

// ─── Provider Capabilities ───

export interface ProviderCapabilities {
  lifecycle: {
    stop: boolean
    resume: boolean
    redeploy: boolean
    terminate: boolean
    scale: boolean
  }
  observability: {
    status: boolean
    logs: boolean
    metrics: boolean
    healthcheckConfig: boolean
  }
  configuration: {
    envUpdate: boolean
    customDomains: boolean
    restartPolicy: boolean
    volumes: boolean
    multiRegion: boolean
  }
}

export interface CapabilitiesResponse {
  provider: string
  engine?: AgentEngine
  runtimeProtocol?: RuntimeProtocol
  deploymentMode: 'managed' | 'manual'
  capabilities: ProviderCapabilities | null
  adapterIdentity?: RuntimeAdapterIdentity | null
  nativeCapabilities?: RuntimeNativeCapability[]
  runtimeServices?: RuntimeServiceDescriptor[]
  adapterProbe?: RuntimeAdapterProbeSummary | null
  transcriptParser?: RuntimeTranscriptParserStatus | null
  commandSpec?: RuntimeCommandSpec | null
  engineHomePolicy?: RuntimeEngineHomePolicy | null
  capabilityReportedAt?: string | null
  managementCommands?: RuntimeManagementCommand[]
  engineCapabilities?: {
    supportsShared: boolean
    supportsC1: boolean
    supportsC2a: boolean
    supportsRelayChannels: boolean
    supportsNativeChannels: boolean
    supportsDeployIntent: boolean
    supportsSharedRunner: boolean
    supportMatrix: {
      shared: 'stable' | 'experimental' | 'planned' | 'unsupported'
      c1Managed: 'stable' | 'experimental' | 'planned' | 'unsupported'
      c2aAutonomous: 'stable' | 'experimental' | 'planned' | 'unsupported'
      relayChannels: 'stable' | 'experimental' | 'planned' | 'unsupported'
      nativeChannels: 'stable' | 'experimental' | 'planned' | 'unsupported'
      toolRuntime: 'stable' | 'experimental' | 'planned' | 'unsupported'
      approvals: 'stable' | 'experimental' | 'planned' | 'unsupported'
      usageAccounting: 'stable' | 'experimental' | 'planned' | 'unsupported'
    }
    notes?: string[]
  }
  warning?: string
}

// ─── Metrics Types ───

export interface MetricsDatapoint {
  timestamp: number
  value: number
}

export interface MetricSeries {
  current?: number
  series?: MetricsDatapoint[]
  unit?: 'percent' | 'bytes' | 'count' | 'ms'
}

export interface DeploymentMetrics {
  cpu?: MetricSeries
  memory?: MetricSeries
  disk?: MetricSeries
  network?: {
    rxBytes?: MetricSeries
    txBytes?: MetricSeries
  }
  collectedAt: number
}

export interface RedeployResult {
  success: boolean
  deployment_id: string
  status: 'queued' | 'deploying' | 'running' | 'failed'
  url?: string
  operation_id?: string
}

// ─── Canvas Topology Types ───

/** Topology data returned by /api/mission-control/canvas/topology */
export interface CanvasTopologyData {
  agents: Array<{
    id: string
    healthScore: number | null
    costTodayUsd: number | null
    tokensTodayInput: number | null
    tokensTodayOutput: number | null
    errorsLastHour: number
  }>
  runtimes?: Array<{
    id: string
    displayName: string
    provider: string
    status: string
    runtimeTier: 'dedicated' | 'byo' | null
    cpuPercent: number | null
    ramPercent: number | null
    lastSeenAt: string | null
  }>
}
