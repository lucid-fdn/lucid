/**
 * Board Memory — Org-level shared knowledge for all agents.
 * CRUD operations for the org_board_memory table.
 */

import 'server-only'
import { createHash } from 'crypto'
import { supabase, ErrorService } from './client'

export interface BoardMemory {
  id: string
  org_id: string
  content: string
  category: 'insight' | 'policy' | 'alert' | 'context'
  importance: number
  source: string
  source_agent_id: string | null
  created_by: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CreateBoardMemoryInput {
  content: string
  category?: 'insight' | 'policy' | 'alert' | 'context'
  importance?: number
  source?: string
  source_agent_id?: string | null
}

export interface UpdateBoardMemoryInput {
  content?: string
  category?: 'insight' | 'policy' | 'alert' | 'context'
  importance?: number
  source?: string
}

// ─── Read ───

export async function getBoardMemories(
  orgId: string,
  options?: { limit?: number; category?: string; includeArchived?: boolean },
): Promise<BoardMemory[]> {
  const limit = options?.limit ?? 20

  let query = supabase
    .from('org_board_memory')
    .select('id, org_id, content, category, importance, source, source_agent_id, created_by, is_archived, created_at, updated_at')
    .eq('org_id', orgId)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!options?.includeArchived) {
    query = query.eq('is_archived', false)
  }

  if (options?.category) {
    query = query.eq('category', options.category)
  }

  // Skip encrypted entries (plaintext only for now)
  query = query.not('content', 'is', null)

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, table: 'org_board_memory', operation: 'SELECT' },
      tags: { layer: 'database', table: 'org_board_memory' },
    })
    return []
  }

  return (data ?? []) as BoardMemory[]
}

// ─── Create ───

export async function createBoardMemory(
  orgId: string,
  userId: string,
  input: CreateBoardMemoryInput,
): Promise<BoardMemory | null> {
  // Generate content hash for dedup (matches assistant_memory pattern)
  const contentHash = createHash('md5').update(input.content.toLowerCase().trim()).digest('hex')

  const row = {
      org_id: orgId,
      content: input.content,
      content_hash: contentHash,
      category: input.category ?? 'insight',
      importance: input.importance ?? 0.7,
      source: input.source ?? 'operator',
      source_agent_id: input.source_agent_id ?? null,
      created_by: userId,
    }

  const insertBoardMemory = async (candidate: typeof row | Omit<typeof row, 'created_by'>) => supabase
    .from('org_board_memory')
    .insert(candidate)
    .select()
    .single()

  let { data, error } = await insertBoardMemory(row)

  if (error?.code === '23503' && /created_by/i.test(error.message ?? '')) {
    // Older databases point created_by at auth.users while app auth returns profiles.id.
    // Keep memory writes available until the profiles FK migration is applied.
    const { created_by: _createdBy, ...rowWithoutActor } = row
    ;({ data, error } = await insertBoardMemory(rowWithoutActor))
  }

  if (error) {
    // 23505 = unique constraint violation (duplicate content hash)
    if (error.code === '23505') {
      return null
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, table: 'org_board_memory', operation: 'INSERT' },
      tags: { layer: 'database', table: 'org_board_memory' },
    })
    throw error
  }

  return data as BoardMemory
}

// ─── Delete ───

export async function deleteBoardMemory(
  orgId: string,
  memoryId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('org_board_memory')
    .delete()
    .eq('id', memoryId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, memoryId, table: 'org_board_memory', operation: 'DELETE' },
      tags: { layer: 'database', table: 'org_board_memory' },
    })
    return false
  }

  return true
}

// ─── Update ───

export async function updateBoardMemory(
  orgId: string,
  memoryId: string,
  input: UpdateBoardMemoryInput,
): Promise<BoardMemory | null> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.content !== undefined) {
    patch.content = input.content
    patch.content_hash = createHash('md5').update(input.content.toLowerCase().trim()).digest('hex')
  }
  if (input.category !== undefined) patch.category = input.category
  if (input.importance !== undefined) patch.importance = input.importance
  if (input.source !== undefined) patch.source = input.source

  const { data, error } = await supabase
    .from('org_board_memory')
    .update(patch)
    .eq('id', memoryId)
    .eq('org_id', orgId)
    .select('id, org_id, content, category, importance, source, source_agent_id, created_by, is_archived, created_at, updated_at')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, memoryId, table: 'org_board_memory', operation: 'UPDATE' },
      tags: { layer: 'database', table: 'org_board_memory' },
    })
    return null
  }

  return data as BoardMemory
}

// ─── Archive ───

export async function archiveBoardMemory(
  orgId: string,
  memoryId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('org_board_memory')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, memoryId, table: 'org_board_memory', operation: 'UPDATE' },
      tags: { layer: 'database', table: 'org_board_memory' },
    })
    return false
  }

  return true
}
