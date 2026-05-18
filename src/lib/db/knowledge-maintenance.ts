import 'server-only'

import { supabase, ErrorService } from './client'
import type { KnowledgeEvidence } from '@/lib/knowledge/types'

export interface KnowledgeMaintenanceEvent {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  sourceId: string | null
  pageId: string | null
  entityId: string | null
  relationshipId: string | null
  claimId: string | null
  eventType: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  summary: string
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed'
  confidence: number
  evidence: KnowledgeEvidence[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type KnowledgeMaintenanceEventRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_id: string | null
  page_id: string | null
  entity_id: string | null
  relationship_id: string | null
  claim_id: string | null
  event_type: string
  severity: KnowledgeMaintenanceEvent['severity']
  title: string
  summary: string
  status: KnowledgeMaintenanceEvent['status']
  confidence: number | string
  evidence: KnowledgeEvidence[] | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const KNOWLEDGE_MAINTENANCE_EVENT_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'source_id',
  'page_id',
  'entity_id',
  'relationship_id',
  'claim_id',
  'event_type',
  'severity',
  'title',
  'summary',
  'status',
  'confidence',
  'evidence',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

export async function listKnowledgeMaintenanceEvents(input: {
  orgId: string
  projectId?: string | null
  status?: KnowledgeMaintenanceEvent['status']
  severity?: KnowledgeMaintenanceEvent['severity']
  limit?: number
}): Promise<KnowledgeMaintenanceEvent[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('knowledge_maintenance_events')
    .select(KNOWLEDGE_MAINTENANCE_EVENT_COLUMNS)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.status) query = query.eq('status', input.status)
  if (input.severity) query = query.eq('severity', input.severity)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'listKnowledgeMaintenanceEvents', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_maintenance_events' },
    })
    return []
  }

  return ((data ?? []) as unknown as KnowledgeMaintenanceEventRow[]).map(mapMaintenanceEvent)
}

export async function updateKnowledgeMaintenanceEventStatus(input: {
  orgId: string
  eventId: string
  status: KnowledgeMaintenanceEvent['status']
}): Promise<KnowledgeMaintenanceEvent | null> {
  const { data, error } = await supabase
    .from('knowledge_maintenance_events')
    .update({ status: input.status })
    .eq('org_id', input.orgId)
    .eq('id', input.eventId)
    .select(KNOWLEDGE_MAINTENANCE_EVENT_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge maintenance status update returned no row'), {
      severity: 'warning',
      context: { operation: 'updateKnowledgeMaintenanceEventStatus', orgId: input.orgId, eventId: input.eventId },
      tags: { layer: 'database', table: 'knowledge_maintenance_events' },
    })
    return null
  }

  return mapMaintenanceEvent(data as unknown as KnowledgeMaintenanceEventRow)
}

function mapMaintenanceEvent(row: KnowledgeMaintenanceEventRow): KnowledgeMaintenanceEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    sourceId: row.source_id,
    pageId: row.page_id,
    entityId: row.entity_id,
    relationshipId: row.relationship_id,
    claimId: row.claim_id,
    eventType: row.event_type,
    severity: row.severity,
    title: row.title,
    summary: row.summary,
    status: row.status,
    confidence: Number(row.confidence),
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
