import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../config.js'

type KnowledgeRefreshStatus = 'pending' | 'ok' | 'failed'
type KnowledgeSourceStatus = 'active' | 'stale' | 'errored'

export interface KnowledgeSourceRefreshRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  source_type: string
  source_ref: string | null
  label: string | null
  status: string
  refresh_interval_seconds: number | null
  refresh_status: string | null
  external_etag: string | null
  connector_key: string | null
}

export interface KnowledgeSourceRefreshResult {
  scanned: number
  refreshed: number
  changed: number
  failed: number
  skipped: number
}

export interface SourceRefreshOutcome {
  status: KnowledgeRefreshStatus
  sourceStatus: KnowledgeSourceStatus
  externalEtag?: string | null
  error?: string | null
  changed?: boolean
}

const SOURCE_REFRESH_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'source_type',
  'source_ref',
  'label',
  'status',
  'refresh_interval_seconds',
  'refresh_status',
  'external_etag',
  'connector_key',
].join(', ')

export async function runKnowledgeSourceRefreshJobs(
  supabase: SupabaseClient,
  config: ReturnType<typeof getConfig>,
  fetchImpl: typeof fetch = fetch,
  options: { orgId?: string | null } = {},
): Promise<KnowledgeSourceRefreshResult> {
  const now = new Date()
  let query = supabase
    .from('knowledge_sources')
    .select(SOURCE_REFRESH_COLUMNS)
    .eq('include_in_retrieval', true)
    .eq('refresh_policy', 'scheduled')
    .neq('status', 'archived')
    .neq('status', 'paused')
    .lte('next_refresh_at', now.toISOString())

  if (options.orgId) query = query.eq('org_id', options.orgId)

  const { data, error } = await query
    .order('next_refresh_at', { ascending: true })
    .limit(config.KNOWLEDGE_SOURCE_REFRESH_BATCH_SIZE)

  if (error) {
    console.warn('[knowledge-source-refresh] failed to load due sources:', error.message)
    return { scanned: 0, refreshed: 0, changed: 0, failed: 0, skipped: 0 }
  }

  const sources = ((data ?? []) as unknown) as KnowledgeSourceRefreshRow[]
  let refreshed = 0
  let changed = 0
  let failed = 0
  let skipped = 0

  for (const source of sources) {
    await markPending(supabase, source, now)
    const outcome = await refreshKnowledgeSource(source, config, fetchImpl)
    const marked = await markOutcome(supabase, source, outcome, config, now)
    if (!marked) {
      failed++
      continue
    }
    if (outcome.status === 'ok') refreshed++
    if (outcome.changed) changed++
    if (outcome.status === 'failed') failed++
    if (outcome.error === 'unsupported_scheduled_source_type') skipped++
  }

  if (sources.length > 0) {
    console.log('[knowledge-source-refresh] batch complete', {
      scanned: sources.length,
      refreshed,
      changed,
      failed,
      skipped,
    })
  }

  return { scanned: sources.length, refreshed, changed, failed, skipped }
}

export async function refreshKnowledgeSource(
  source: KnowledgeSourceRefreshRow,
  config: ReturnType<typeof getConfig>,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceRefreshOutcome> {
  if (source.source_type === 'url') {
    return refreshUrlSource(source, config, fetchImpl)
  }

  if (source.connector_key) {
    return {
      status: 'ok',
      sourceStatus: 'active',
      error: null,
      changed: false,
    }
  }

  return {
    status: 'failed',
    sourceStatus: 'errored',
    error: 'unsupported_scheduled_source_type',
    changed: false,
  }
}

export function calculateNextKnowledgeSourceRefreshAt(
  source: Pick<KnowledgeSourceRefreshRow, 'refresh_interval_seconds'>,
  config: ReturnType<typeof getConfig>,
  now = new Date(),
): string {
  const intervalSeconds = source.refresh_interval_seconds
    ?? config.KNOWLEDGE_SOURCE_REFRESH_DEFAULT_INTERVAL_SECONDS
  return new Date(now.getTime() + intervalSeconds * 1000).toISOString()
}

export function calculateKnowledgeSourceStaleAfter(
  source: Pick<KnowledgeSourceRefreshRow, 'refresh_interval_seconds'>,
  config: ReturnType<typeof getConfig>,
  now = new Date(),
): string {
  const intervalSeconds = source.refresh_interval_seconds
    ?? config.KNOWLEDGE_SOURCE_REFRESH_DEFAULT_INTERVAL_SECONDS
  return new Date(now.getTime() + intervalSeconds * 2 * 1000).toISOString()
}

async function refreshUrlSource(
  source: KnowledgeSourceRefreshRow,
  config: ReturnType<typeof getConfig>,
  fetchImpl: typeof fetch,
): Promise<SourceRefreshOutcome> {
  if (!source.source_ref) {
    return { status: 'failed', sourceStatus: 'errored', error: 'missing_url', changed: false }
  }

  let url: URL
  try {
    url = new URL(source.source_ref)
  } catch {
    return { status: 'failed', sourceStatus: 'errored', error: 'invalid_url', changed: false }
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { status: 'failed', sourceStatus: 'errored', error: 'unsupported_url_protocol', changed: false }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.KNOWLEDGE_SOURCE_REFRESH_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      return {
        status: 'failed',
        sourceStatus: 'errored',
        error: `url_head_${response.status}`,
        changed: false,
      }
    }

    const externalEtag = buildUrlSourceEtag(response)
    const changed = Boolean(source.external_etag && externalEtag && source.external_etag !== externalEtag)
    return {
      status: 'ok',
      sourceStatus: changed ? 'stale' : 'active',
      externalEtag,
      error: null,
      changed,
    }
  } catch (error) {
    return {
      status: 'failed',
      sourceStatus: 'errored',
      error: error instanceof Error && error.name === 'AbortError'
        ? 'url_head_timeout'
        : `url_head_error:${error instanceof Error ? error.message.slice(0, 180) : 'unknown'}`,
      changed: false,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildUrlSourceEtag(response: Response): string | null {
  const etag = response.headers.get('etag')
  if (etag) return etag

  const lastModified = response.headers.get('last-modified')
  const contentLength = response.headers.get('content-length')
  if (lastModified || contentLength) {
    return `head:${lastModified ?? 'unknown'}:${contentLength ?? 'unknown'}`
  }

  return null
}

async function markPending(
  supabase: SupabaseClient,
  source: KnowledgeSourceRefreshRow,
  now: Date,
): Promise<void> {
  const { error } = await supabase
    .from('knowledge_sources')
    .update({
      refresh_status: 'pending',
      last_seen_at: now.toISOString(),
      refresh_error: null,
    })
    .eq('org_id', source.org_id)
    .eq('id', source.id)

  if (error) {
    console.warn('[knowledge-source-refresh] failed to mark source pending:', source.id, error.message)
  }
}

async function markOutcome(
  supabase: SupabaseClient,
  source: KnowledgeSourceRefreshRow,
  outcome: SourceRefreshOutcome,
  config: ReturnType<typeof getConfig>,
  now: Date,
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    refresh_status: outcome.status,
    status: outcome.sourceStatus,
    last_seen_at: now.toISOString(),
    last_refreshed_at: now.toISOString(),
    next_refresh_at: calculateNextKnowledgeSourceRefreshAt(source, config, now),
    stale_after: outcome.status === 'ok' && !outcome.changed
      ? calculateKnowledgeSourceStaleAfter(source, config, now)
      : now.toISOString(),
    refresh_error: outcome.error ?? null,
  }

  if (outcome.externalEtag !== undefined) patch.external_etag = outcome.externalEtag

  const { error } = await supabase
    .from('knowledge_sources')
    .update(patch)
    .eq('org_id', source.org_id)
    .eq('id', source.id)

  if (error) {
    console.warn('[knowledge-source-refresh] failed to record source outcome:', source.id, error.message)
    return false
  }
  return true
}
