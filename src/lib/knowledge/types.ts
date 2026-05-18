export type KnowledgeLayer =
  | 'session'
  | 'assistant_memory'
  | 'team_brain'
  | 'project_brain'
  | 'org_brain'
  | 'claims'
  | 'rag'
  | 'evidence'
  | 'l2'

export type KnowledgeSourceType =
  | 'channel'
  | 'file'
  | 'repo'
  | 'url'
  | 'run'
  | 'manual'
  | 'project'
  | 'team'
  | 'org'
  | 'engine_home'
  | 'agent_ops'
  | 'agent_commerce'
  | 'board_memory'

export type KnowledgeVisibility = 'private' | 'team' | 'project' | 'org' | 'federated'
export type KnowledgeTrustLevel = 'unverified' | 'observed' | 'operator_approved' | 'system' | 'l2_verified'
export type KnowledgeProofMode = 'off' | 'optional' | 'required'
export type KnowledgeFederationPolicy = 'isolated' | 'source_scoped' | 'org_federated'
export type KnowledgeRetentionPolicy = 'ephemeral' | 'standard' | 'audit' | 'legal_hold'
export type KnowledgeSourceStatus = 'active' | 'paused' | 'stale' | 'errored' | 'archived'
export type KnowledgeRefreshPolicy = 'manual' | 'on_change' | 'scheduled'
export type KnowledgeRefreshStatus = 'never' | 'pending' | 'ok' | 'failed'
export type KnowledgeEntityType =
  | 'person'
  | 'company'
  | 'project'
  | 'repo'
  | 'pull_request'
  | 'channel'
  | 'url'
  | 'agent'
  | 'decision'
  | 'integration'
  | 'topic'
export type KnowledgeRelationshipType =
  | 'mentions'
  | 'relates_to'
  | 'depends_on'
  | 'blocks'
  | 'owns'
  | 'uses'
  | 'decided'
  | 'produced_by'
  | 'supersedes'
  | 'handoff_to'
  | 'works_on'

export interface KnowledgeSource {
  id?: string
  type: KnowledgeSourceType
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
  agentPassportId?: string | null
  channelType?: string | null
  channelId?: string | null
  conversationId?: string | null
  externalMessageId?: string | null
  url?: string | null
  label?: string | null
  visibility: KnowledgeVisibility
  trustLevel: KnowledgeTrustLevel
  federationPolicy?: KnowledgeFederationPolicy
  retentionPolicy?: KnowledgeRetentionPolicy
  includeInRetrieval?: boolean
  refreshPolicy?: KnowledgeRefreshPolicy
  refreshIntervalSeconds?: number | null
}

export interface KnowledgeEvidence {
  id?: string
  kind:
    | 'run'
    | 'channel_event'
    | 'message'
    | 'file'
    | 'url'
    | 'screenshot'
    | 'transcript'
    | 'diff'
    | 'log'
    | 'approval'
    | 'l2_proof'
    | 'commerce_event'
  runId?: string | null
  channelEventId?: string | null
  messageId?: string | null
  artifactId?: string | null
  url?: string | null
  l2ReceiptId?: string | null
  commerceEventId?: string | null
  label?: string | null
}

export interface RetrievedKnowledge {
  id: string
  layer: KnowledgeLayer
  content: string
  source?: KnowledgeSource
  score: number
  citations: KnowledgeEvidence[]
  trustLevel: KnowledgeTrustLevel
  freshness?: 'fresh' | 'aging' | 'stale' | 'unknown'
  tokenCost: number
  redactionState?: 'none' | 'redacted' | 'encrypted_unavailable'
  metadata?: Record<string, unknown>
}

export interface KnowledgePromptPacketItem {
  id: string
  layer: KnowledgeLayer
  label: string
  content: string
  citations: KnowledgeEvidence[]
  citationKeys: string[]
  sourceLabel?: string | null
  freshness?: RetrievedKnowledge['freshness']
  trustLevel: KnowledgeTrustLevel
  tokenCost: number
  confidence?: number
}

export interface KnowledgePromptPacket {
  version: '2026-05-06.knowledge-prompt-packet.v1'
  generatedAt: string
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
  mode: 'summary' | 'evidence' | 'full'
  budget: {
    maxLatencyMs: number
    maxPromptTokens: number
    maxItemsPerLayer: number
  }
  items: KnowledgePromptPacketItem[]
  omitted: Array<{
    layer: KnowledgeLayer
    reason: 'budget' | 'timeout' | 'policy' | 'unavailable' | 'empty'
    count?: number
  }>
  telemetry: {
    durationMs: number
    timedOut: boolean
    fallbackUsed: boolean
    retrievalCounts: Partial<Record<KnowledgeLayer, number>>
  }
  layerUsage?: Array<{
    layer: KnowledgeLayer
    itemCount: number
    citationCount: number
    averageConfidence: number
    freshness: NonNullable<RetrievedKnowledge['freshness']>
  }>
  contextExplanation?: {
    latestMessage: string | null
    currentRunOrTask: string | null
    project: string | null
    team: string | null
    orgPolicy: string | null
    owner: string | null
    blockers: string[]
    nextAction: string | null
    policyHints: string[]
  }
  quality?: {
    confidence: number
    citationCoverage: number
    freshness: NonNullable<RetrievedKnowledge['freshness']>
    l2ProofCount: number
    contradictionCount: number
  }
  costControls?: {
    totalTokenCost: number
    perLayerTokenCost: Partial<Record<KnowledgeLayer, number>>
    maxPromptTokens: number
    budgetUtilization: number
    exceeded: boolean
    recommendedAction: 'ok' | 'tighten_layer_budget' | 'summarize_or_archive_sources'
  }
}

export interface KnowledgeContextLadder {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  workflowRunId?: string | null
  parentRunId?: string | null
  channelType?: string | null
  channelId?: string | null
  conversationId?: string | null
  ownerUserId?: string | null
  policyHints: string[]
  summaries: Array<{
    layer: 'channel' | 'workflow' | 'task' | 'project' | 'team' | 'org'
    text: string
  }>
}

export interface KnowledgeHotPacket {
  sourceEventId?: string | null
  latestMessage?: string | null
  latestDelta?: string | null
  blockers: string[]
  continuationSummary?: string | null
  changedEvidence: KnowledgeEvidence[]
  fallbackFetchRequired: boolean
}

export interface KnowledgeBudget {
  maxLatencyMs?: number
  maxPromptTokens?: number
  maxItemsPerLayer?: number
}

export interface RetrieveKnowledgeContextInput {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
  sourceId?: string | null
  sourceKey?: string | null
  query: string
  layers?: KnowledgeLayer[]
  contextLadder?: KnowledgeContextLadder
  hotPacket?: KnowledgeHotPacket
  mode?: KnowledgePromptPacket['mode']
  budget?: KnowledgeBudget
  proofMode?: KnowledgeProofMode
  evalCapture?: {
    enabled?: boolean
    surface?: 'app_api' | 'mission_control' | 'worker_tool' | 'mcp' | 'agent_ops' | 'external_agent' | 'runtime'
    caseId?: string | null
    expectedItemIds?: string[]
    expectedCitationKeys?: string[]
    actorUserId?: string | null
    metadata?: Record<string, unknown>
  }
}

export interface RememberForAssistantInput {
  orgId: string
  assistantId: string
  scopedUserId: string
  content: string
  category: 'fact' | 'preference' | 'instruction' | 'context'
  source: KnowledgeSource
  evidence: KnowledgeEvidence[]
}

export interface WriteScopedKnowledgeInput {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  source: KnowledgeSource
  subject: string
  compiledTruthPatch: string
  event: {
    type: 'created' | 'updated' | 'corrected' | 'superseded' | 'archived'
    summary: string
    confidence?: number
  }
  evidence: KnowledgeEvidence[]
}

export interface ExplainKnowledgeInput {
  orgId: string
  knowledgeId: string
  includeTimeline?: boolean
  includeProofs?: boolean
}
