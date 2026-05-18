import 'server-only'

import crypto from 'node:crypto'

import type {
  CreateEvalReceiptInput,
  EvalReceipt,
} from '@contracts/eval-receipts'
import { ErrorService, supabase } from './client'

const EVAL_RECEIPT_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'run_id',
  'source_type',
  'source_id',
  'task',
  'output_hash',
  'dimensions',
  'judges',
  'verdict',
  'aggregate',
  'metadata',
  'created_at',
].join(', ')

type EvalReceiptRow = {
  id: string
  org_id: string
  project_id: string | null
  run_id: string | null
  source_type: EvalReceipt['sourceType']
  source_id: string
  task: string
  output_hash: string
  dimensions: string[] | null
  judges: EvalReceipt['judges'] | null
  verdict: EvalReceipt['verdict']
  aggregate: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function recordEvalReceipt(input: CreateEvalReceiptInput): Promise<EvalReceipt> {
  const { data, error } = await supabase
    .from('agent_ops_eval_receipts')
    .upsert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      run_id: input.runId ?? null,
      source_type: input.sourceType,
      source_id: input.sourceId,
      task: input.task,
      output_hash: input.outputHash,
      dimensions: input.dimensions,
      judges: input.judges,
      verdict: input.verdict,
      aggregate: input.aggregate,
      metadata: input.metadata,
    }, { onConflict: 'org_id,source_type,source_id,output_hash' })
    .select(EVAL_RECEIPT_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, sourceType: input.sourceType, sourceId: input.sourceId, operation: 'recordEvalReceipt' },
      tags: { layer: 'database', table: 'agent_ops_eval_receipts' },
    })
    throw error
  }

  return mapEvalReceipt(data as unknown as EvalReceiptRow)
}

export async function listEvalReceipts(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  sourceType?: EvalReceipt['sourceType']
  sourceId?: string | null
  limit?: number
}): Promise<EvalReceipt[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('agent_ops_eval_receipts')
    .select(EVAL_RECEIPT_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.runId) query = query.eq('run_id', input.runId)
  if (input.sourceType) query = query.eq('source_type', input.sourceType)
  if (input.sourceId) query = query.eq('source_id', input.sourceId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listEvalReceipts' },
      tags: { layer: 'database', table: 'agent_ops_eval_receipts' },
    })
    return []
  }

  return ((data ?? []) as unknown as EvalReceiptRow[]).map(mapEvalReceipt)
}

export function hashEvalOutput(output: unknown): string {
  const payload = typeof output === 'string' ? output : JSON.stringify(output)
  return crypto.createHash('sha256').update(payload ?? '').digest('hex')
}

function mapEvalReceipt(row: EvalReceiptRow): EvalReceipt {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.run_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    task: row.task,
    outputHash: row.output_hash,
    dimensions: row.dimensions ?? [],
    judges: row.judges ?? [],
    verdict: row.verdict,
    aggregate: row.aggregate ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}
