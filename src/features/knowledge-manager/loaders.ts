import 'server-only'

import {
  getAssistants,
  getBoardMemories,
  listKnowledgeMaintenanceEvents,
  listKnowledgePages,
  listKnowledgeSources,
} from '@/lib/db'
import { getCrews } from '@/lib/db/crews'
import { getProjectsForWorkspace } from '@/lib/db/projects'
import { listDocuments } from '@/lib/rag/documents'
import type { KnowledgePage, KnowledgeSourceRecord } from '@/lib/db/knowledge'
import type { RAGDocument } from '@/lib/rag/types'
import type {
  KnowledgeDocumentItem,
  KnowledgeFactItem,
  KnowledgeManagerData,
  KnowledgeManagerScope,
  KnowledgeManagerStatus,
  KnowledgeReviewItem,
  KnowledgeSourceItem,
} from './types'

export async function loadKnowledgeManagerData(input: {
  orgId: string
  orgName: string
  projectId?: string | null
  projectName?: string | null
  hasTestedRecall?: boolean
}): Promise<KnowledgeManagerData> {
  const workspaceScope: KnowledgeManagerScope = { type: 'workspace', orgId: input.orgId, label: 'Workspace' }
  const projectScope: KnowledgeManagerScope | null = input.projectId
    ? { type: 'project', orgId: input.orgId, projectId: input.projectId, label: input.projectName ?? 'Default project' }
    : null

  const [projectPages, teamPages, orgMemories, documentsResult, sources, reviewItemsRaw] = await Promise.all([
    safeKnowledgeLoad('project knowledge pages', () => listKnowledgePages({ orgId: input.orgId, scopeType: 'project', limit: 100 }), []),
    safeKnowledgeLoad('team knowledge pages', () => listKnowledgePages({ orgId: input.orgId, scopeType: 'team', limit: 100 }), []),
    safeKnowledgeLoad('workspace memory', () => getBoardMemories(input.orgId, { limit: 100 }), []),
    safeKnowledgeLoad('documents', () => listDocuments(input.orgId, { projectId: input.projectId ?? undefined, limit: 100 }), { documents: [], total: 0 }),
    safeKnowledgeLoad('knowledge sources', () => listKnowledgeSources({ orgId: input.orgId, includeArchived: true, limit: 200 }), []),
    safeKnowledgeLoad('knowledge review events', () => listKnowledgeMaintenanceEvents({ orgId: input.orgId, status: 'open', limit: 50 }), []),
  ])
  const [projects, teams, assistants] = await Promise.all([
    safeKnowledgeLoad('projects', () => getProjectsForWorkspace(input.orgId), []),
    safeKnowledgeLoad('teams', () => getCrews(input.orgId), []),
    safeKnowledgeLoad('assistants', () => getAssistants(input.orgId), []),
  ])

  const projectScopes: KnowledgeManagerScope[] = projects.map((project) => ({
    type: 'project',
    orgId: input.orgId,
    projectId: project.id,
    label: project.name,
  }))
  const teamScopes: KnowledgeManagerScope[] = teams.map((team) => ({
    type: 'team',
    orgId: input.orgId,
    projectId: team.project_id ?? null,
    teamId: team.id,
    label: team.name,
  }))
  const agentScopes: KnowledgeManagerScope[] = (assistants as Array<{ id: string; name: string; project_id?: string | null }>).map((assistant) => ({
    type: 'agent',
    orgId: input.orgId,
    projectId: assistant.project_id ?? null,
    assistantId: assistant.id,
    label: assistant.name,
  }))
  const scopes = dedupeScopes([
    workspaceScope,
    ...(projectScope ? [projectScope] : []),
    ...projectScopes,
    ...teamScopes,
    ...agentScopes,
  ])
  const facts: KnowledgeFactItem[] = [
    ...orgMemories.map((memory) => ({
      id: memory.id,
      storageType: 'board_memory' as const,
      scope: workspaceScope,
      subject: labelFromText(memory.content),
      truth: memory.content,
      status: 'ready' as const,
      trustLabel: memory.source === 'system' ? 'System' as const : 'Approved' as const,
      evidenceCount: 0,
      usedByAgentCount: 0,
      updatedAt: memory.updated_at,
    })),
    ...projectPages.map((page) => mapKnowledgePageToFact(page, projectScope ?? workspaceScope)),
    ...teamPages.map((page) => mapKnowledgePageToFact(page, {
      type: 'team',
      orgId: input.orgId,
      projectId: page.projectId,
      teamId: page.teamId ?? '',
      label: 'Team',
    })),
  ]
  const documents = documentsResult.documents.map((document) => mapDocument(document, projectScope ?? workspaceScope))
  const sourceItems = sources.map((source) => mapSource(source, resolveSourceScope(source, workspaceScope, projectScope)))
  const reviewItems: KnowledgeReviewItem[] = reviewItemsRaw.map((event) => ({
    id: event.id,
    title: event.title,
    summary: event.summary,
    severity: event.severity,
    status: event.status,
    actionLabel: event.severity === 'critical' ? 'Review now' : 'Review',
  }))

  const citedFacts = facts.filter((fact) => fact.evidenceCount > 0).length
  const readyDocuments = documents.filter((document) => document.status === 'ready').length
  const hasKnowledge = facts.length > 0 || documents.length > 0
  const hasTestedRecall = Boolean(input.hasTestedRecall)

  return {
    overview: {
      orgId: input.orgId,
      orgName: input.orgName,
      defaultScope: projectScope ?? workspaceScope,
      counts: {
        facts: {
          total: facts.length,
          workspace: orgMemories.length,
          project: projectPages.length,
          team: teamPages.length,
          agent: 0,
        },
        documents: {
          total: documents.length,
          ready: readyDocuments,
          indexing: documents.filter((document) => document.status === 'indexing').length,
          failed: documents.filter((document) => document.status === 'failed').length,
        },
        sources: {
          total: sourceItems.length,
          active: sourceItems.filter((source) => source.status === 'ready').length,
          stale: sourceItems.filter((source) => source.status === 'needs_review').length,
          paused: sourceItems.filter((source) => source.status === 'paused').length,
          archived: sourceItems.filter((source) => source.status === 'archived').length,
        },
        review: {
          open: reviewItems.length,
          critical: reviewItems.filter((item) => item.severity === 'critical').length,
        },
      },
      activation: {
        hasKnowledge,
        hasTestedRecall,
        readyForAgents: hasKnowledge && (readyDocuments > 0 || facts.length > 0),
        checklist: [
          { id: 'add_knowledge', label: 'Add first fact or document', completed: hasKnowledge },
          { id: 'test_recall', label: 'Test recall once', completed: hasTestedRecall },
          { id: 'review_source', label: 'Approve or review one source', completed: sourceItems.some((source) => source.trustLabel === 'Approved' || source.trustLabel === 'Verified') },
        ],
      },
      health: {
        citationCoverage: facts.length === 0 ? 1 : citedFacts / facts.length,
        emptyRecallRate: null,
        latestEvalPassRate: null,
        staleSourceCount: sourceItems.filter((source) => source.status === 'needs_review' || source.status === 'failed').length,
      },
    },
    scopes,
    facts,
    documents,
    sources: sourceItems,
    reviewItems,
  }
}

async function safeKnowledgeLoad<T>(
  label: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    console.warn('[knowledge-manager] Partial load failed; rendering available data', {
      source: label,
      error: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

function mapKnowledgePageToFact(page: KnowledgePage, scope: KnowledgeManagerScope): KnowledgeFactItem {
  return {
    id: page.id,
    storageType: 'knowledge_page',
    scope,
    subject: page.subject,
    truth: page.compiledTruth,
    status: mapPageStatus(page.status),
    trustLabel: mapTrustLabel(page.trustLevel),
    evidenceCount: page.evidence.length,
    usedByAgentCount: 0,
    updatedAt: page.updatedAt,
  }
}

function mapDocument(document: RAGDocument, fallbackScope: KnowledgeManagerScope): KnowledgeDocumentItem {
  return {
    id: document.id,
    sourceId: null,
    scope: fallbackScope,
    title: document.title,
    status: mapDocumentStatus(document.status),
    sourceType: mapDocumentSourceType(document.sourceType),
    chunkCount: document.chunkCount,
    retrievalEnabled: document.status === 'ready',
    lastIndexedAt: document.updatedAt,
    lastRefreshAt: null,
    error: null,
  }
}

function mapSource(source: KnowledgeSourceRecord, scope: KnowledgeManagerScope): KnowledgeSourceItem {
  return {
    id: source.id,
    label: source.label ?? source.sourceRef ?? source.type,
    scope,
    type: source.type,
    status: mapSourceStatus(source),
    retrievalEnabled: source.includeInRetrieval,
    trustLabel: mapTrustLabel(source.trustLevel),
    visibility: source.visibility.replace(/_/g, ' '),
    federationPolicy: source.federationPolicy,
    retentionPolicy: source.retentionPolicy,
    refreshLabel: source.refreshPolicy.replace(/_/g, ' '),
    refreshPolicy: source.refreshPolicy,
    lastRefreshAt: source.lastRefreshedAt,
    nextRefreshAt: source.nextRefreshAt,
    error: source.refreshError,
  }
}

function resolveSourceScope(
  source: KnowledgeSourceRecord,
  workspaceScope: KnowledgeManagerScope,
  projectScope: KnowledgeManagerScope | null,
): KnowledgeManagerScope {
  if (source.teamId) return { type: 'team', orgId: source.orgId, projectId: source.projectId, teamId: source.teamId, label: 'Team' }
  if (source.projectId && projectScope) return projectScope
  if (source.assistantId) return { type: 'agent', orgId: source.orgId, projectId: source.projectId, assistantId: source.assistantId, label: 'Agent' }
  return workspaceScope
}

function mapPageStatus(status: KnowledgePage['status']): KnowledgeManagerStatus {
  if (status === 'archived') return 'archived'
  if (status === 'superseded') return 'needs_review'
  return 'ready'
}

function mapDocumentStatus(status: string): KnowledgeManagerStatus {
  if (status === 'processing' || status === 'pending') return 'indexing'
  if (status === 'error') return 'failed'
  return 'ready'
}

function mapSourceStatus(source: KnowledgeSourceRecord): KnowledgeManagerStatus {
  if (source.status === 'archived') return 'archived'
  if (!source.includeInRetrieval || source.status === 'paused') return 'paused'
  if (source.status === 'errored' || source.refreshStatus === 'failed') return 'failed'
  if (source.status === 'stale') return 'needs_review'
  return 'ready'
}

function mapDocumentSourceType(sourceType: string): KnowledgeDocumentItem['sourceType'] {
  if (sourceType === 'upload' || sourceType === 'file') return 'file'
  if (sourceType === 'url') return 'url'
  if (sourceType === 'api') return 'api'
  return 'paste'
}

function mapTrustLabel(trustLevel: string): KnowledgeFactItem['trustLabel'] {
  if (trustLevel === 'l2_verified') return 'Verified'
  if (trustLevel === 'system') return 'System'
  if (trustLevel === 'operator_approved') return 'Approved'
  return 'Observed'
}

function labelFromText(content: string): string {
  const firstSentence = content.split(/[.\n]/)[0]?.trim()
  return firstSentence ? firstSentence.slice(0, 120) : 'Workspace fact'
}

function dedupeScopes(scopes: KnowledgeManagerScope[]): KnowledgeManagerScope[] {
  const seen = new Set<string>()
  return scopes.filter((scope) => {
    const key = scope.type === 'workspace'
      ? 'workspace'
      : scope.type === 'project'
        ? `project:${scope.projectId}`
        : scope.type === 'team'
          ? `team:${scope.teamId}`
          : `agent:${scope.assistantId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
