import 'server-only'

import { getBoardMemories } from '@/lib/db/board-memory'
import { listKnowledgePages, listKnowledgeSources } from '@/lib/db/knowledge'
import { findKnowledgeEntities } from '@/lib/db/knowledge-graph'
import { listSharedContextRecords } from '@/lib/db/shared-context'

export interface BrainHealthCheck {
  id: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  message: string
  action?: string
}

export interface BrainHealthReport {
  orgId: string
  score: number
  checks: BrainHealthCheck[]
  counts: {
    sources: number
    facts: number
    guidance: number
    pages: number
    entities: number
  }
}

export async function getBrainHealthReport(input: {
  orgId: string
}): Promise<BrainHealthReport> {
  const [sources, facts, guidance, pages, entities] = await Promise.all([
    listKnowledgeSources({ orgId: input.orgId, includeArchived: true, limit: 200 }),
    getBoardMemories(input.orgId, { limit: 200 }),
    listSharedContextRecords({ workspaceId: input.orgId, limit: 200 }),
    listKnowledgePages({ orgId: input.orgId, limit: 100 }),
    findKnowledgeEntities({ orgId: input.orgId, limit: 100 }),
  ])

  const activeSources = sources.filter((source) => source.status !== 'archived')
  const staleSources = activeSources.filter((source) => source.status === 'stale' || source.refreshStatus === 'failed')
  const missingProvenanceFacts = facts.filter((fact) => !fact.source || fact.source === 'operator')
  const checks: BrainHealthCheck[] = [
    {
      id: 'source_registry',
      label: 'Source registry',
      status: activeSources.length > 0 ? 'ok' : 'warn',
      message: activeSources.length > 0
        ? `${activeSources.length} active source${activeSources.length === 1 ? '' : 's'} registered.`
        : 'No active sources are registered yet.',
      action: activeSources.length > 0 ? undefined : 'Add a URL, document, repo, or connector source.',
    },
    {
      id: 'knowledge_seed',
      label: 'Knowledge seed',
      status: facts.length + pages.length > 0 ? 'ok' : 'warn',
      message: facts.length + pages.length > 0
        ? `${facts.length + pages.length} fact/page item${facts.length + pages.length === 1 ? '' : 's'} available.`
        : 'No facts or compiled knowledge pages are available yet.',
      action: facts.length + pages.length > 0 ? undefined : 'Add a fact or document to Brain.',
    },
    {
      id: 'guidance_seed',
      label: 'Guidance seed',
      status: guidance.length > 0 ? 'ok' : 'warn',
      message: guidance.length > 0
        ? `${guidance.length} guidance record${guidance.length === 1 ? '' : 's'} available.`
        : 'No durable guidance records are available yet.',
      action: guidance.length > 0 ? undefined : 'Add policy, decision, risk, thesis, or preference guidance.',
    },
    {
      id: 'source_freshness',
      label: 'Source freshness',
      status: staleSources.length === 0 ? 'ok' : 'fail',
      message: staleSources.length === 0
        ? 'No stale or failed sources detected.'
        : `${staleSources.length} source${staleSources.length === 1 ? '' : 's'} need refresh or repair.`,
      action: staleSources.length === 0 ? undefined : 'Open Knowledge and refresh failed sources.',
    },
    {
      id: 'graph_coverage',
      label: 'Graph coverage',
      status: entities.length > 0 || facts.length + pages.length === 0 ? 'ok' : 'warn',
      message: entities.length > 0
        ? `${entities.length} graph entit${entities.length === 1 ? 'y' : 'ies'} indexed.`
        : 'No graph entities indexed yet.',
      action: entities.length > 0 ? undefined : 'Run extraction on sources or documents.',
    },
    {
      id: 'provenance_coverage',
      label: 'Provenance coverage',
      status: missingProvenanceFacts.length <= Math.max(3, facts.length * 0.5) ? 'ok' : 'warn',
      message: missingProvenanceFacts.length === 0
        ? 'Facts have source attribution.'
        : `${missingProvenanceFacts.length} fact${missingProvenanceFacts.length === 1 ? '' : 's'} rely on manual/operator provenance.`,
      action: missingProvenanceFacts.length === 0 ? undefined : 'Attach sources or documents to important facts.',
    },
  ]

  const score = Math.round((checks.filter((check) => check.status === 'ok').length / checks.length) * 100)
  return {
    orgId: input.orgId,
    score,
    checks,
    counts: {
      sources: activeSources.length,
      facts: facts.length,
      guidance: guidance.length,
      pages: pages.length,
      entities: entities.length,
    },
  }
}
