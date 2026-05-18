import 'server-only'

import type {
  CreateKnowledgeImportJobInput,
  KnowledgeImportItem,
  KnowledgeImportJob,
} from '@contracts/knowledge-imports'
import type { KnowledgeImportPreviewPlanItem } from '@/lib/knowledge/imports/types'
import { ErrorService, supabase } from './client'

const IMPORT_JOB_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'source_type',
  'mode',
  'status',
  'item_count',
  'redaction_count',
  'error_message',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const IMPORT_ITEM_COLUMNS = [
  'id',
  'org_id',
  'import_job_id',
  'item_key',
  'item_type',
  'status',
  'content_hash',
  'title',
  'preview',
  'redactions',
  'output_refs',
  'metadata',
  'created_at',
].join(', ')

type ImportJobRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_type: KnowledgeImportJob['sourceType']
  mode: KnowledgeImportJob['mode']
  status: KnowledgeImportJob['status']
  item_count: number | null
  redaction_count: number | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ImportItemRow = {
  id: string
  org_id: string
  import_job_id: string
  item_key: string
  item_type: string
  status: KnowledgeImportItem['status']
  content_hash: string
  title: string | null
  preview: string | null
  redactions: KnowledgeImportItem['redactions'] | null
  output_refs: KnowledgeImportItem['outputRefs'] | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function createKnowledgeImportJob(input: CreateKnowledgeImportJobInput): Promise<KnowledgeImportJob> {
  const { data, error } = await supabase
    .from('knowledge_import_jobs')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      team_id: input.teamId ?? null,
      source_type: input.sourceType,
      mode: input.mode,
      status: input.status,
      metadata: input.metadata,
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select(IMPORT_JOB_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, sourceType: input.sourceType, operation: 'createKnowledgeImportJob' },
      tags: { layer: 'database', table: 'knowledge_import_jobs' },
    })
    throw error
  }

  return mapImportJob(data as unknown as ImportJobRow)
}

export async function listKnowledgeImportJobs(input: {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  status?: KnowledgeImportJob['status']
  limit?: number
}): Promise<KnowledgeImportJob[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('knowledge_import_jobs')
    .select(IMPORT_JOB_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listKnowledgeImportJobs' },
      tags: { layer: 'database', table: 'knowledge_import_jobs' },
    })
    return []
  }

  return ((data ?? []) as unknown as ImportJobRow[]).map(mapImportJob)
}

export async function getKnowledgeImportJob(input: {
  orgId: string
  importJobId: string
}): Promise<KnowledgeImportJob | null> {
  const { data, error } = await supabase
    .from('knowledge_import_jobs')
    .select(IMPORT_JOB_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.importJobId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, importJobId: input.importJobId, operation: 'getKnowledgeImportJob' },
      tags: { layer: 'database', table: 'knowledge_import_jobs' },
    })
    return null
  }

  return data ? mapImportJob(data as unknown as ImportJobRow) : null
}

export async function updateKnowledgeImportJob(input: {
  orgId: string
  importJobId: string
  status?: KnowledgeImportJob['status']
  itemCount?: number
  redactionCount?: number
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}): Promise<KnowledgeImportJob> {
  const patch: Record<string, unknown> = {}
  if (input.status) patch.status = input.status
  if (typeof input.itemCount === 'number') patch.item_count = input.itemCount
  if (typeof input.redactionCount === 'number') patch.redaction_count = input.redactionCount
  if ('errorMessage' in input) patch.error_message = input.errorMessage ?? null
  if (input.metadata) patch.metadata = input.metadata

  const { data, error } = await supabase
    .from('knowledge_import_jobs')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('id', input.importJobId)
    .select(IMPORT_JOB_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, importJobId: input.importJobId, operation: 'updateKnowledgeImportJob' },
      tags: { layer: 'database', table: 'knowledge_import_jobs' },
    })
    throw error
  }

  return mapImportJob(data as unknown as ImportJobRow)
}

export async function listKnowledgeImportItems(input: {
  orgId: string
  importJobId: string
  limit?: number
}): Promise<KnowledgeImportItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500)
  const { data, error } = await supabase
    .from('knowledge_import_items')
    .select(IMPORT_ITEM_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('import_job_id', input.importJobId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, importJobId: input.importJobId, operation: 'listKnowledgeImportItems' },
      tags: { layer: 'database', table: 'knowledge_import_items' },
    })
    return []
  }

  return ((data ?? []) as unknown as ImportItemRow[]).map(mapImportItem)
}

export async function findKnowledgeImportItemsByContentHashes(input: {
  orgId: string
  contentHashes: string[]
  excludeImportJobId?: string | null
  limit?: number
}): Promise<KnowledgeImportItem[]> {
  const uniqueHashes = Array.from(new Set(input.contentHashes)).filter(Boolean).slice(0, 500)
  if (uniqueHashes.length === 0) return []
  const limit = Math.min(Math.max(input.limit ?? uniqueHashes.length, 1), 500)
  let query = supabase
    .from('knowledge_import_items')
    .select(IMPORT_ITEM_COLUMNS)
    .eq('org_id', input.orgId)
    .in('content_hash', uniqueHashes)
    .limit(limit)

  if (input.excludeImportJobId) query = query.neq('import_job_id', input.excludeImportJobId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'findKnowledgeImportItemsByContentHashes' },
      tags: { layer: 'database', table: 'knowledge_import_items' },
    })
    return []
  }

  return ((data ?? []) as unknown as ImportItemRow[]).map(mapImportItem)
}

export async function upsertKnowledgeImportItems(input: {
  orgId: string
  importJobId: string
  items: KnowledgeImportPreviewPlanItem[]
}): Promise<KnowledgeImportItem[]> {
  if (input.items.length === 0) return []

  const rows = input.items.map((item) => ({
    org_id: input.orgId,
    import_job_id: input.importJobId,
    item_key: item.itemKey,
    item_type: item.itemType,
    status: item.status,
    content_hash: item.contentHash,
    title: item.title,
    preview: item.preview,
    redactions: item.redactions,
    output_refs: item.outputRefs,
    metadata: item.metadata,
  }))

  const { data, error } = await supabase
    .from('knowledge_import_items')
    .upsert(rows, { onConflict: 'import_job_id,item_key' })
    .select(IMPORT_ITEM_COLUMNS)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, importJobId: input.importJobId, operation: 'upsertKnowledgeImportItems' },
      tags: { layer: 'database', table: 'knowledge_import_items' },
    })
    throw error
  }

  return ((data ?? []) as unknown as ImportItemRow[]).map(mapImportItem)
}

export async function updateKnowledgeImportItemStatus(input: {
  orgId: string
  importJobId: string
  itemId: string
  status: KnowledgeImportItem['status']
  outputRefs?: Array<Record<string, unknown>>
  metadata?: Record<string, unknown>
}): Promise<KnowledgeImportItem> {
  const patch: Record<string, unknown> = { status: input.status }
  if (input.outputRefs) patch.output_refs = input.outputRefs
  if (input.metadata) patch.metadata = input.metadata

  const { data, error } = await supabase
    .from('knowledge_import_items')
    .update(patch)
    .eq('org_id', input.orgId)
    .eq('import_job_id', input.importJobId)
    .eq('id', input.itemId)
    .select(IMPORT_ITEM_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, importJobId: input.importJobId, itemId: input.itemId, operation: 'updateKnowledgeImportItemStatus' },
      tags: { layer: 'database', table: 'knowledge_import_items' },
    })
    throw error
  }

  return mapImportItem(data as unknown as ImportItemRow)
}

function mapImportJob(row: ImportJobRow): KnowledgeImportJob {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    sourceType: row.source_type,
    mode: row.mode,
    status: row.status,
    itemCount: row.item_count ?? 0,
    redactionCount: row.redaction_count ?? 0,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapImportItem(row: ImportItemRow): KnowledgeImportItem {
  return {
    id: row.id,
    orgId: row.org_id,
    importJobId: row.import_job_id,
    itemKey: row.item_key,
    itemType: row.item_type,
    status: row.status,
    contentHash: row.content_hash,
    title: row.title,
    preview: row.preview,
    redactions: row.redactions ?? [],
    outputRefs: row.output_refs ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}
