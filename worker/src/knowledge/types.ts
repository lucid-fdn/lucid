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

export type KnowledgeTrustLevel = 'unverified' | 'observed' | 'operator_approved' | 'system' | 'l2_verified'

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

export interface KnowledgePromptPacketItem {
  id: string
  layer: KnowledgeLayer
  label: string
  content: string
  citations: KnowledgeEvidence[]
  citationKeys?: string[]
  sourceLabel?: string | null
  freshness?: 'fresh' | 'aging' | 'stale' | 'unknown'
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
    freshness: 'fresh' | 'aging' | 'stale' | 'unknown'
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
    freshness: 'fresh' | 'aging' | 'stale' | 'unknown'
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
  assistantId?: string | null
  channelType?: string | null
  channelId?: string | null
  conversationId?: string | null
  policyHints: string[]
}

export interface KnowledgeHotPacket {
  sourceEventId?: string | null
  latestMessage?: string | null
  fallbackFetchRequired: boolean
}
