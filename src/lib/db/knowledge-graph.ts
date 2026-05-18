import 'server-only'

import type {
  KnowledgeEntityType,
  KnowledgeEvidence,
  KnowledgeRelationshipType,
} from '@/lib/knowledge/types'
import {
  extractKnowledgeEntitiesFromText,
  inferKnowledgeRelationships,
  normalizeKnowledgeEntityName,
  type ExtractedKnowledgeEntity,
} from '@/lib/knowledge/graph'
import { supabase, ErrorService } from './client'

export interface KnowledgeEntityRecord {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  sourceId: string | null
  type: KnowledgeEntityType
  canonicalName: string
  normalizedName: string
  description: string | null
  status: 'active' | 'merged' | 'archived' | 'needs_review'
  mergedIntoEntityId: string | null
  confidence: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeRelationshipRecord {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  sourceEntityId: string
  targetEntityId: string
  sourceId: string | null
  pageId: string | null
  eventId: string | null
  relationType: KnowledgeRelationshipType
  direction: 'directed' | 'bidirectional'
  confidence: number
  evidence: KnowledgeEvidence[]
  metadata: Record<string, unknown>
  status: 'active' | 'archived' | 'needs_review'
  createdAt: string
  updatedAt: string
}

export interface KnowledgeGraphNeighbor {
  entity: KnowledgeEntityRecord
  relationship: KnowledgeRelationshipRecord
  direction: 'outbound' | 'inbound'
}

type EntityRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_id: string | null
  entity_type: KnowledgeEntityType
  canonical_name: string
  normalized_name: string
  description: string | null
  status: KnowledgeEntityRecord['status']
  merged_into_entity_id: string | null
  confidence: number | string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type RelationshipRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_entity_id: string
  target_entity_id: string
  source_id: string | null
  page_id: string | null
  event_id: string | null
  relation_type: KnowledgeRelationshipType
  direction: 'directed' | 'bidirectional'
  confidence: number | string
  evidence: KnowledgeEvidence[] | null
  metadata: Record<string, unknown> | null
  status: KnowledgeRelationshipRecord['status']
  created_at: string
  updated_at: string
}

const ENTITY_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'source_id',
  'entity_type',
  'canonical_name',
  'normalized_name',
  'description',
  'status',
  'merged_into_entity_id',
  'confidence',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const RELATIONSHIP_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'source_entity_id',
  'target_entity_id',
  'source_id',
  'page_id',
  'event_id',
  'relation_type',
  'direction',
  'confidence',
  'evidence',
  'metadata',
  'status',
  'created_at',
  'updated_at',
].join(', ')

export async function upsertKnowledgeEntity(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  sourceId?: string | null
  type: KnowledgeEntityType
  canonicalName: string
  description?: string | null
  confidence?: number
  metadata?: Record<string, unknown>
}): Promise<KnowledgeEntityRecord | null> {
  const normalizedName = normalizeKnowledgeEntityName(input.canonicalName)
  if (!normalizedName) return null

  const { data: existing } = await supabase
    .from('knowledge_entities')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('entity_type', input.type)
    .eq('normalized_name', normalizedName)
    .eq('status', 'active')
    .maybeSingle()

  const row = {
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    team_id: input.teamId ?? null,
    source_id: input.sourceId ?? null,
    entity_type: input.type,
    canonical_name: input.canonicalName.trim(),
    normalized_name: normalizedName,
    description: input.description ?? null,
    status: 'active',
    confidence: input.confidence ?? 0.75,
    metadata: input.metadata ?? {},
  }

  const write = existing?.id
    ? supabase
        .from('knowledge_entities')
        .update(row)
        .eq('id', existing.id)
    : supabase
        .from('knowledge_entities')
        .insert(row)
  const { data, error } = await write.select(ENTITY_COLUMNS).single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge entity upsert returned no row'), {
      severity: 'warning',
      context: { operation: 'upsertKnowledgeEntity', orgId: input.orgId, type: input.type },
      tags: { layer: 'database', table: 'knowledge_entities' },
    })
    return null
  }

  return mapEntity(data as unknown as EntityRow)
}

export async function addKnowledgeEntityAlias(input: {
  orgId: string
  entityId: string
  alias: string
  sourceId?: string | null
  confidence?: number
  metadata?: Record<string, unknown>
}): Promise<void> {
  const normalizedAlias = normalizeKnowledgeEntityName(input.alias)
  if (!normalizedAlias) return
  const { data: existing } = await supabase
    .from('knowledge_entity_aliases')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('normalized_alias', normalizedAlias)
    .eq('is_active', true)
    .maybeSingle()

  const row = {
    org_id: input.orgId,
    entity_id: input.entityId,
    alias: input.alias.trim(),
    normalized_alias: normalizedAlias,
    source_id: input.sourceId ?? null,
    confidence: input.confidence ?? 0.75,
    is_active: true,
    metadata: input.metadata ?? {},
  }
  const { error } = existing?.id
    ? await supabase.from('knowledge_entity_aliases').update(row).eq('id', existing.id)
    : await supabase.from('knowledge_entity_aliases').insert(row)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'addKnowledgeEntityAlias', orgId: input.orgId, entityId: input.entityId },
      tags: { layer: 'database', table: 'knowledge_entity_aliases' },
    })
  }
}

export async function upsertKnowledgeRelationship(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  sourceEntityId: string
  targetEntityId: string
  sourceId?: string | null
  pageId?: string | null
  eventId?: string | null
  relationType: KnowledgeRelationshipType
  direction?: 'directed' | 'bidirectional'
  confidence?: number
  evidence?: KnowledgeEvidence[]
  metadata?: Record<string, unknown>
}): Promise<KnowledgeRelationshipRecord | null> {
  if (input.sourceEntityId === input.targetEntityId) return null
  const { data: existing } = await supabase
    .from('knowledge_relationships')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('source_entity_id', input.sourceEntityId)
    .eq('target_entity_id', input.targetEntityId)
    .eq('relation_type', input.relationType)
    .eq('status', 'active')
    .maybeSingle()

  const row = {
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    team_id: input.teamId ?? null,
    source_entity_id: input.sourceEntityId,
    target_entity_id: input.targetEntityId,
    source_id: input.sourceId ?? null,
    page_id: input.pageId ?? null,
    event_id: input.eventId ?? null,
    relation_type: input.relationType,
    direction: input.direction ?? 'directed',
    confidence: input.confidence ?? 0.7,
    evidence: input.evidence ?? [],
    metadata: input.metadata ?? {},
    status: 'active',
  }
  const write = existing?.id
    ? supabase
        .from('knowledge_relationships')
        .update(row)
        .eq('id', existing.id)
    : supabase
        .from('knowledge_relationships')
        .insert(row)
  const { data, error } = await write.select(RELATIONSHIP_COLUMNS).single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge relationship upsert returned no row'), {
      severity: 'warning',
      context: { operation: 'upsertKnowledgeRelationship', orgId: input.orgId, relationType: input.relationType },
      tags: { layer: 'database', table: 'knowledge_relationships' },
    })
    return null
  }

  return mapRelationship(data as unknown as RelationshipRow)
}

export async function ingestKnowledgeGraphFromText(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  sourceId?: string | null
  pageId?: string | null
  eventId?: string | null
  text: string
  evidence?: KnowledgeEvidence[]
}): Promise<{ entities: KnowledgeEntityRecord[]; relationships: KnowledgeRelationshipRecord[] }> {
  const extracted = extractKnowledgeEntitiesFromText(input.text)
  const entities = await upsertExtractedEntities(input, extracted)
  const byNormalized = new Map(entities.map((entity) => [entity.normalizedName, entity]))
  const relationships: KnowledgeRelationshipRecord[] = []

  for (const relationship of inferKnowledgeRelationships(extracted)) {
    const source = byNormalized.get(relationship.sourceNormalizedName)
    const target = byNormalized.get(relationship.targetNormalizedName)
    if (!source || !target) continue
    const saved = await upsertKnowledgeRelationship({
      orgId: input.orgId,
      projectId: input.projectId,
      teamId: input.teamId,
      sourceId: input.sourceId,
      pageId: input.pageId,
      eventId: input.eventId,
      sourceEntityId: source.id,
      targetEntityId: target.id,
      relationType: relationship.relationType,
      confidence: relationship.confidence,
      evidence: input.evidence ?? [],
      metadata: relationship.metadata,
    })
    if (saved) relationships.push(saved)
  }

  return { entities, relationships }
}

export async function findKnowledgeEntities(input: {
  orgId: string
  query?: string
  types?: KnowledgeEntityType[]
  projectId?: string | null
  teamId?: string | null
  sourceId?: string | null
  limit?: number
}): Promise<KnowledgeEntityRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  let query = supabase
    .from('knowledge_entities')
    .select(ENTITY_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('status', 'active')

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.sourceId) query = query.eq('source_id', input.sourceId)
  if (input.types?.length) query = query.in('entity_type', input.types)
  if (input.query?.trim()) {
    query = query.ilike('normalized_name', `%${normalizeKnowledgeEntityName(input.query)}%`)
  }

  const { data, error } = await query
    .order('confidence', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'findKnowledgeEntities', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_entities' },
    })
    return []
  }

  return ((data ?? []) as unknown as EntityRow[]).map(mapEntity)
}

export async function getKnowledgeGraphNeighbors(input: {
  orgId: string
  entityId: string
  depth?: number
  limit?: number
}): Promise<KnowledgeGraphNeighbor[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  const { data: relationships, error } = await supabase
    .from('knowledge_relationships')
    .select(RELATIONSHIP_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('status', 'active')
    .or(`source_entity_id.eq.${input.entityId},target_entity_id.eq.${input.entityId}`)
    .order('confidence', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'getKnowledgeGraphNeighbors', orgId: input.orgId, entityId: input.entityId },
      tags: { layer: 'database', table: 'knowledge_relationships' },
    })
    return []
  }

  const mappedRelationships = ((relationships ?? []) as unknown as RelationshipRow[]).map(mapRelationship)
  const neighborIds = Array.from(new Set(mappedRelationships.map((relationship) =>
    relationship.sourceEntityId === input.entityId ? relationship.targetEntityId : relationship.sourceEntityId,
  )))
  if (neighborIds.length === 0) return []

  const { data: entities } = await supabase
    .from('knowledge_entities')
    .select(ENTITY_COLUMNS)
    .eq('org_id', input.orgId)
    .in('id', neighborIds)
  const entityById = new Map(((entities ?? []) as unknown as EntityRow[]).map((row) => {
    const entity = mapEntity(row)
    return [entity.id, entity] as const
  }))

  return mappedRelationships.flatMap((relationship) => {
    const outbound = relationship.sourceEntityId === input.entityId
    const entity = entityById.get(outbound ? relationship.targetEntityId : relationship.sourceEntityId)
    return entity ? [{ entity, relationship, direction: outbound ? 'outbound' as const : 'inbound' as const }] : []
  })
}

async function upsertExtractedEntities(
  input: {
    orgId: string
    projectId?: string | null
    teamId?: string | null
    sourceId?: string | null
  },
  extracted: ExtractedKnowledgeEntity[],
): Promise<KnowledgeEntityRecord[]> {
  const entities: KnowledgeEntityRecord[] = []
  for (const entity of extracted) {
    const saved = await upsertKnowledgeEntity({
      orgId: input.orgId,
      projectId: input.projectId,
      teamId: input.teamId,
      sourceId: input.sourceId,
      type: entity.type,
      canonicalName: entity.canonicalName,
      confidence: entity.confidence,
      metadata: entity.metadata,
    })
    if (!saved) continue
    entities.push(saved)
    for (const alias of entity.aliases) {
      await addKnowledgeEntityAlias({ orgId: input.orgId, entityId: saved.id, alias, sourceId: input.sourceId })
    }
  }
  return entities
}

function mapEntity(row: EntityRow): KnowledgeEntityRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    sourceId: row.source_id,
    type: row.entity_type,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    description: row.description,
    status: row.status,
    mergedIntoEntityId: row.merged_into_entity_id,
    confidence: Number(row.confidence),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRelationship(row: RelationshipRow): KnowledgeRelationshipRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    sourceId: row.source_id,
    pageId: row.page_id,
    eventId: row.event_id,
    relationType: row.relation_type,
    direction: row.direction,
    confidence: Number(row.confidence),
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    metadata: row.metadata ?? {},
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
