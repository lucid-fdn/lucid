export type KnowledgeManagerScope =
  | { type: 'workspace'; orgId: string; label: string }
  | { type: 'project'; orgId: string; projectId: string; label: string }
  | { type: 'team'; orgId: string; projectId?: string | null; teamId: string; label: string }
  | { type: 'agent'; orgId: string; projectId?: string | null; assistantId: string; label: string }

export type KnowledgeManagerStatus =
  | 'ready'
  | 'indexing'
  | 'needs_review'
  | 'paused'
  | 'failed'
  | 'archived'

export type KnowledgeManagerTab = 'overview' | 'context' | 'knowledge' | 'health'
export type KnowledgeBaseSection = 'all' | 'facts' | 'documents' | 'sources'

export interface KnowledgeManagerOverview {
  orgId: string
  orgName: string
  defaultScope: KnowledgeManagerScope
  counts: {
    facts: { total: number; workspace: number; project: number; team: number; agent: number }
    documents: { total: number; ready: number; indexing: number; failed: number }
    sources: { total: number; active: number; stale: number; paused: number; archived: number }
    review: { open: number; critical: number }
  }
  activation: {
    hasKnowledge: boolean
    hasTestedRecall: boolean
    readyForAgents: boolean
    checklist: Array<{ id: string; label: string; completed: boolean }>
  }
  health: {
    citationCoverage: number
    emptyRecallRate: number | null
    latestEvalPassRate: number | null
    staleSourceCount: number
  }
}

export interface KnowledgeFactItem {
  id: string
  storageType: 'board_memory' | 'knowledge_page'
  scope: KnowledgeManagerScope
  subject: string
  truth: string
  status: KnowledgeManagerStatus
  trustLabel: 'Observed' | 'Approved' | 'Verified' | 'System'
  evidenceCount: number
  usedByAgentCount: number
  updatedAt: string
}

export interface KnowledgeDocumentItem {
  id: string
  sourceId: string | null
  scope: KnowledgeManagerScope
  title: string
  status: KnowledgeManagerStatus
  sourceType: 'file' | 'url' | 'paste' | 'connector' | 'api'
  chunkCount: number
  retrievalEnabled: boolean
  lastIndexedAt: string | null
  lastRefreshAt: string | null
  error: string | null
}

export interface KnowledgeSourceItem {
  id: string
  label: string
  scope: KnowledgeManagerScope
  type: string
  status: KnowledgeManagerStatus
  retrievalEnabled: boolean
  trustLabel: string
  visibility: string
  federationPolicy: string
  retentionPolicy: string
  refreshLabel: string
  refreshPolicy: string
  lastRefreshAt: string | null
  nextRefreshAt: string | null
  error: string | null
}

export interface KnowledgeReviewItem {
  id: string
  title: string
  summary: string
  severity: 'info' | 'warning' | 'critical'
  status: string
  actionLabel: string
}

export interface KnowledgeRecallPreview {
  requestId: string
  query: string
  scope: KnowledgeManagerScope
  items: Array<{
    id: string
    label: string
    layer: 'workspace' | 'project' | 'team' | 'agent' | 'document' | 'evidence' | 'proof'
    content: string
    sourceLabel: string | null
    citations: string[]
    confidence: number | null
  }>
  omitted: Array<{ layer: string; reason: string; count: number }>
  readyForAgents: boolean
}

export interface KnowledgeManagerData {
  overview: KnowledgeManagerOverview
  scopes: KnowledgeManagerScope[]
  facts: KnowledgeFactItem[]
  documents: KnowledgeDocumentItem[]
  sources: KnowledgeSourceItem[]
  reviewItems: KnowledgeReviewItem[]
}
