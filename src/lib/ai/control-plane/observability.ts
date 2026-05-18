import 'server-only'

import { supabase } from '@/lib/db/client'
import type { AIFeature, AIModality } from './types'

export type AIGenerationDashboardEvent = {
  id: string
  userId: string
  feature: AIFeature | string
  modality: AIModality | string | null
  orgId: string | null
  assistantId: string | null
  projectId: string | null
  provider: string | null
  model: string | null
  success: boolean
  tokensUsed: number | null
  estimatedCostUsd: number | null
  latencyMs: number | null
  error: string | null
  createdAt: string
}

export type AIGenerationUsageRollup = {
  day: string
  orgId: string | null
  assistantId: string | null
  projectId: string | null
  feature: string
  modality: string | null
  provider: string | null
  model: string | null
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  imageTokens: number
  textTokens: number
  bytes: number
  estimatedCostUsd: number
  avgLatencyMs: number | null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function metadataOf(row: { metadata?: unknown }): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {}
}

function mapDashboardEvent(row: Record<string, unknown>): AIGenerationDashboardEvent {
  const metadata = metadataOf(row)
  const usage = metadataOf({ metadata: metadata.usage })
  const receipt = metadataOf({ metadata: metadata.receipt })

  return {
    id: String(row.id),
    userId: String(row.user_id),
    feature: String(row.feature),
    modality: readString(metadata.modality),
    orgId: readString(metadata.orgId),
    assistantId: readString(metadata.assistantId),
    projectId: readString(metadata.projectId),
    provider: readString(metadata.provider),
    model: readString(metadata.model),
    success: row.success === true,
    tokensUsed: readNumber(row.tokens_used),
    estimatedCostUsd: readNumber(usage.estimatedCostUsd),
    latencyMs: readNumber(receipt.latencyMs),
    error: readString(metadata.error),
    createdAt: String(row.created_at),
  }
}

export async function listAIGenerationDashboardEvents(input: {
  orgId: string
  assistantId?: string | null
  modality?: AIModality
  feature?: AIFeature
  limit?: number
}): Promise<AIGenerationDashboardEvent[]> {
  let query = supabase
    .from('ai_generation_events')
    .select('id, user_id, feature, prompt, success, tokens_used, metadata, created_at')
    .eq('metadata->>orgId', input.orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200))

  if (input.assistantId) query = query.eq('metadata->>assistantId', input.assistantId)
  if (input.modality) query = query.eq('metadata->>modality', input.modality)
  if (input.feature) query = query.eq('feature', input.feature)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapDashboardEvent(row as Record<string, unknown>))
}

export async function listAIGenerationUsageRollups(input: {
  orgId: string
  days?: number
  assistantId?: string | null
  modality?: AIModality
}): Promise<AIGenerationUsageRollup[]> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - Math.min(Math.max(input.days ?? 30, 1), 180))

  let query = supabase
    .from('ai_generation_usage_daily')
    .select('*')
    .eq('org_id', input.orgId)
    .gte('day', since.toISOString().slice(0, 10))
    .order('day', { ascending: false })

  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)
  if (input.modality) query = query.eq('modality', input.modality)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      day: String(record.day),
      orgId: readString(record.org_id),
      assistantId: readString(record.assistant_id),
      projectId: readString(record.project_id),
      feature: String(record.feature),
      modality: readString(record.modality),
      provider: readString(record.provider),
      model: readString(record.model),
      requestCount: readNumber(record.request_count) ?? 0,
      successCount: readNumber(record.success_count) ?? 0,
      failureCount: readNumber(record.failure_count) ?? 0,
      totalTokens: readNumber(record.total_tokens) ?? 0,
      inputTokens: readNumber(record.input_tokens) ?? 0,
      outputTokens: readNumber(record.output_tokens) ?? 0,
      imageTokens: readNumber(record.image_tokens) ?? 0,
      textTokens: readNumber(record.text_tokens) ?? 0,
      bytes: readNumber(record.bytes) ?? 0,
      estimatedCostUsd: readNumber(record.estimated_cost_usd) ?? 0,
      avgLatencyMs: readNumber(record.avg_latency_ms),
    }
  })
}

export async function listRecentAgentAvatarGenerationFailures(input: {
  orgId: string
  assistantId?: string | null
  limit?: number
}): Promise<AIGenerationDashboardEvent[]> {
  let query = supabase
    .from('ai_generation_avatar_failures_recent')
    .select('*')
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 100))

  if (input.assistantId) query = query.eq('assistant_id', input.assistantId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      id: String(record.id),
      userId: String(record.user_id),
      feature: String(record.feature),
      modality: readString(record.modality),
      orgId: readString(record.org_id),
      assistantId: readString(record.assistant_id),
      projectId: readString(record.project_id),
      provider: readString(record.provider),
      model: readString(record.model),
      success: false,
      tokensUsed: readNumber(record.tokens_used),
      estimatedCostUsd: readNumber(record.estimated_cost_usd),
      latencyMs: readNumber(record.latency_ms),
      error: readString(record.error),
      createdAt: String(record.created_at),
    }
  })
}
