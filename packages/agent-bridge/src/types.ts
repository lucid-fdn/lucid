/**
 * Agent Bridge — Types
 *
 * Wire types (shared with control plane REST protocol) and SDK types.
 * Wire types are the single source of truth — worker re-exports from this package.
 */

// =============================================================================
// Wire Types — Heartbeat & Telemetry
// =============================================================================

/** Status of a native channel adapter running in-process (C2a mode). */
export interface NativeChannelStatus {
  channelType: string
  accountId: string
  status: 'connected' | 'reconnecting' | 'error' | 'stopped'
  lastMessageAt?: string
  errorMessage?: string
}

/** Payload sent to POST /api/runtimes/heartbeat every 30s. */
export interface HeartbeatPayload {
  runtimeId: string
  /** Deployment generation — prevents stale heartbeats after re-provisioning. */
  generation: number
  engine?: string
  runtimeProtocol?: string
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
  /** Set to 'shutdown' on final heartbeat before process exit. */
  status?: 'connected' | 'shutdown'
  nativeChannels?: NativeChannelStatus[]
  /** Runtime capability plane — adapter identity and engine-native feature report. */
  adapterIdentity?: Record<string, unknown> | null
  nativeCapabilities?: Array<Record<string, unknown>>
  runtimeServices?: Array<Record<string, unknown>>
  adapterProbe?: Record<string, unknown> | null
  transcriptParser?: Record<string, unknown> | null
  commandSpec?: Record<string, unknown> | null
  engineHomePolicy?: Record<string, unknown> | null
  /** Hardware specs — reported once per session, updated on reconnect. */
  systemInfo?: {
    cpuModel?: string
    cpuCores?: number
    ramTotalGb?: number
    diskTotalGb?: number
    platform?: string
    arch?: string
  }
}

/** Engine-agnostic command sent by Mission Control to a BYO/dedicated runtime. */
export interface RuntimeManagementCommand {
  id: string
  runtimeId: string
  orgId: string
  commandType: string
  targetCapabilityId?: string | null
  payload: Record<string, unknown>
  status: 'queued' | 'sent' | 'accepted' | 'rejected' | 'needs_user_action' | 'applied' | 'failed' | 'expired'
  response?: Record<string, unknown> | null
  error?: string | null
  requestedBy?: string | null
  requestedAt: string
  dispatchedAt?: string | null
  acknowledgedAt?: string | null
  expiresAt?: string | null
}

/** Response from POST /api/runtimes/heartbeat. */
export interface HeartbeatResponse {
  status: 'ok'
  pendingActions?: unknown[]
  managementCommands?: RuntimeManagementCommand[]
  configVersion?: string
}

export type RuntimeManagementCommandAckStatus =
  | 'accepted'
  | 'rejected'
  | 'needs_user_action'
  | 'applied'
  | 'failed'

export interface RuntimeManagementCommandAck {
  commandId: string
  status: RuntimeManagementCommandAckStatus
  response?: Record<string, unknown> | null
  error?: string | null
}

// =============================================================================
// Wire Types — Feed Events
// =============================================================================

/** Event reported to POST /api/runtimes/events (batched, max 100). */
export interface FeedEvent {
  agentId?: string
  eventType:
    | 'tool_call'
    | 'tool_result'
    | 'native_mutation_candidate'
    | 'error'
    | 'runtime_migration_started'
    | 'runtime_migration_completed'
    | 'runtime_migration_failed'
    | 'message_received'
    | 'message_sent'
    | 'run_started'
    | 'run_finished'
    | 'channel_connected'
    | 'channel_disconnected'
    | 'channel_deactivated'
  severity: 'info' | 'warning' | 'error' | 'critical'
  payload: Record<string, unknown>
}

// =============================================================================
// Wire Types — Approvals
// =============================================================================

/** Submitted to POST /api/runtimes/approvals for elevated tool gating. */
export interface ApprovalRequest {
  agentId: string
  toolName: string
  toolArgs: Record<string, unknown>
  runId: string
  /** Max time to wait for resolution (ms). Auto-denies on expiry. */
  timeoutMs: number
}

/** Polled from GET /api/runtimes/approvals/pending until resolved. */
export type ApprovalResolution = {
  decision: 'approved' | 'denied' | 'expired'
  resolvedAt: string
}

// =============================================================================
// Wire Types — Health & Cost
// =============================================================================

/** Submitted to POST /api/runtimes/health-scores (hourly). */
export interface HealthScorePayload {
  agentId: string
  overallScore: number
  dimensions: Record<string, number>
}

/** Submitted to POST /api/runtimes/costs (per-run token accounting). */
export interface CostPayload {
  agentId: string
  runId: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

// =============================================================================
// Wire Types — AI Generation Control Plane
// =============================================================================

export type AIGenerationFeature =
  | 'ai-chat'
  | 'workflow-generation'
  | 'project-generation'
  | 'image-generation'
  | 'agent-avatar-generation'
  | 'agent-cover-generation'
  | 'generic-image-generation'
  | 'voice-preview'
  | 'voice-reply'
  | 'transcription'
  | 'agent-run'

export type AIGenerationModality =
  | 'text'
  | 'structured'
  | 'embedding'
  | 'image'
  | 'transcription'
  | 'speech'
  | 'builder'
  | 'agent-run'

export interface AIGenerationReceiptUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  imageTokens?: number
  textTokens?: number
  bytes?: number
  estimatedCostUsd?: number
}

export interface AIGenerationReceiptProvider {
  provider?: string
  model?: string
  latencyMs?: number
  requestId?: string
  metadata?: Record<string, unknown>
}

/** Submitted to POST /api/runtimes/ai-generation-events for unified AI usage telemetry. */
export interface AIGenerationReceiptPayload {
  runId: string
  agentId?: string
  userId?: string
  projectId?: string | null
  feature: AIGenerationFeature
  modality: AIGenerationModality
  prompt: string
  success: boolean
  model?: string
  provider?: string
  usage?: AIGenerationReceiptUsage
  receipt?: AIGenerationReceiptProvider | Record<string, unknown>
  metadata?: Record<string, unknown>
  error?: string
}

// =============================================================================
// Wire Types — C1 REST Message Relay
// =============================================================================

/**
 * Bounded message packet claimed from POST /api/runtimes/messages/claim-inbound.
 * Contains everything the agent needs to process a user message without DB access.
 */
export interface RunPacket {
  eventId: string
  idempotencyToken: string
  /** Pulse claim metadata for control-plane lease release on complete/fail. */
  _pulse?: {
    runId: string
    leaseToken: string
    agentId: string
  }
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
    /** Agent SOUL — persistent persona injected after system prompt */
    soulContent: string | null
    runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous'
    modelId: string
    temperature: number
    maxTokens: number
    enabledTools: string[]
    policyConfig: Record<string, unknown>
    memoryEnabled: boolean
    approvalRequiredTools: string[]
    /** Org ID for multi-tenant isolation — required for approval gate and billing. */
    orgId: string
  }
  recentMessages: Array<{
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }>
  memoryInjection: string[]
  /** Org-level board memories (shared knowledge across all agents) */
  boardMemories: string[]
  conversationSummary: string | null
  userMessage: {
    text: string
    externalMessageId: string
    externalUserId: string
    messageData: Record<string, unknown> | null
  }
  skills: Array<{
    slug: string
    content: string
  }>
  plugins: Array<{
    slug: string
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  }>
}

/** Submitted to POST /api/runtimes/messages/complete-inbound after processing. */
export interface CompleteInboundPayload {
  eventId: string
  runId: string
  responseText: string
  resolvedUserMessageText?: string
  outputArtifacts?: Array<{ toolName: string; result: string }>
  tokenUsage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
}

/** Response from complete-inbound. `alreadyApplied` is true on duplicate submission. */
export interface CompleteResult {
  alreadyApplied: boolean
  delivered: boolean
  externalMessageId?: string
  channelType?: string
  deliveryError?: string
}

// =============================================================================
// Wire Types — StepRunPacket Protocol (Phase 4N-c, DAG internal steps)
// =============================================================================

/**
 * Bounded packet handed to dedicated runtimes when they claim a DAG step.
 * Mirrors RunPacket but step-shaped instead of inbound-message-shaped.
 * Mirrors contracts/dag.ts StepRunPacket — kept in sync.
 */
export interface StepRunPacket {
  stepId: string
  dagId: string
  dagNodeId: string
  stepType: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  attempt: number
  leaseExpiresAt: string
  payload: unknown
  agentContext?: {
    soulSnapshot?: string | null
    boardMemorySnapshot?: string | null
  }
  /** Optional bounded assistant config for step executors that run the agent loop. */
  assistantConfig?: {
    id: string
    name: string
    engine?: 'openclaw' | 'hermes'
    systemPrompt: string | null
    soulContent: string | null
    runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous'
    modelId: string
    temperature: number
    maxTokens: number
    policyConfig: Record<string, unknown>
    memoryEnabled: boolean
    approvalRequiredTools: string[]
    orgId: string
  }
  memoryInjection?: string[]
  boardMemories?: string[]
  conversationSummary?: string | null
}

/** Body for POST /api/runtimes/steps/complete. */
export interface CompleteStepPayload {
  stepId: string
  output?: string
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
}

/** Body for POST /api/runtimes/steps/fail. */
export interface FailStepPayload {
  stepId: string
  errorMessage: string
  retryable: boolean
}

/** Response from POST /api/runtimes/steps/renew-lease. */
export interface RenewStepLeaseResult {
  ok: true
  leaseExpiresAt: string
}

// =============================================================================
// SDK Types — Configuration
// =============================================================================

export interface BridgeConfig {
  /** Runtime UUID from Mission Control. */
  runtimeId: string
  /** API key from Mission Control (scrypt-hashed, prefix-indexed). */
  runtimeKey: string
  /** Control plane URL (e.g., 'https://lucid.foundation'). */
  controlPlaneUrl: string
  /** 'full' = Lucid drives execution via relay. 'observe' = agent drives, Lucid watches. */
  mode?: 'full' | 'observe'
  /** Deployment generation counter (default: 1). */
  generation?: number
  /** Engine key reported to Mission Control (e.g. 'openclaw', 'hermes'). */
  engine?: string
  /** Runtime protocol reported to Mission Control (default: 'lucid-runtime-v2'). */
  runtimeProtocol?: string
  /** Engine implementation version reported in heartbeat payloads. */
  engineVersion?: string
  /** Runtime package/container version reported in heartbeat payloads. */
  runtimeVersion?: string
  /** Heartbeat interval in ms (default: 30000). */
  heartbeatIntervalMs?: number
  /** Event batch flush interval in ms (default: 5000). */
  eventFlushIntervalMs?: number
  /** Message claim polling interval in ms, full mode only (default: 5000). */
  messagePollIntervalMs?: number
  /** Long-poll wait budget for claim-inbound requests (default: 15000). */
  messageClaimWaitMs?: number
  /** Offline ring buffer capacity (default: 1000). */
  offlineBufferCapacity?: number
  /** Runtime capability plane fields reported on every heartbeat. */
  adapterIdentity?: HeartbeatPayload['adapterIdentity']
  nativeCapabilities?: HeartbeatPayload['nativeCapabilities']
  runtimeServices?: HeartbeatPayload['runtimeServices']
  adapterProbe?: HeartbeatPayload['adapterProbe']
  transcriptParser?: HeartbeatPayload['transcriptParser']
  commandSpec?: HeartbeatPayload['commandSpec']
  engineHomePolicy?: HeartbeatPayload['engineHomePolicy']
  /** Custom logger. Default: console with [lucid-bridge] prefix. */
  logger?: BridgeLogger
}

// =============================================================================
// SDK Types — Logger
// =============================================================================

/** Logger interface — inject your own (pino, winston, etc.) or use the console default. */
export interface BridgeLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

// =============================================================================
// SDK Types — Message Handling (Full Mode)
// =============================================================================

/** Structured Lucid platform tool execution request for dedicated runtimes. */
export interface ToolExecutionRequest {
  agentId: string
  runId: string
  toolName: string
  toolArgs: Record<string, unknown>
}

/** Structured Lucid platform tool execution result for dedicated runtimes. */
export interface ToolExecutionResult {
  status: 'completed' | 'failed'
  output: string
}

/** Optional runtime-side hook for executing Lucid platform tools in full mode. */
export type ToolExecutionHandler = (
  request: ToolExecutionRequest,
) => Promise<ToolExecutionResult>

/** Context passed to the message handler — report events, request approvals, track costs. */
export interface MessageContext {
  /** Report a feed event visible in Mission Control. */
  reportEvent(event: Omit<FeedEvent, 'agentId'>): void
  /** Request approval for a sensitive tool call. Blocks until resolved or timeout. */
  requestApproval(request: Omit<ApprovalRequest, 'agentId'>): Promise<ApprovalResolution>
  /** Report token usage / cost for this run. */
  reportCost(cost: Omit<CostPayload, 'agentId'>): void
  /** Report an AI generation receipt for this run. */
  reportAIGeneration(receipt: Omit<AIGenerationReceiptPayload, 'agentId' | 'runId'>): void
  /** Execute a Lucid platform tool through the dedicated-runtime bridge when available. */
  executeTool?(
    request: Omit<ToolExecutionRequest, 'agentId' | 'runId'>,
  ): Promise<ToolExecutionResult>
}

/** Response from the message handler — sent to complete-inbound. */
export interface MessageResponse {
  responseText: string
  outputArtifacts?: Array<{ toolName: string; result: string }>
  tokenUsage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
}

/** User-provided callback that processes a RunPacket and returns a response. */
export type MessageHandler = (packet: RunPacket, ctx: MessageContext) => Promise<MessageResponse>

/** Optional callback for runtime management commands delivered on heartbeat. */
export type RuntimeManagementCommandHandler = (
  commands: RuntimeManagementCommand[],
) => Promise<RuntimeManagementCommandAck[] | void>

// =============================================================================
// SDK Types — Observe Mode
// =============================================================================

/** Result from trackRun() — the handler response plus timing. */
export interface RunResult extends MessageResponse {
  durationMs: number
}
