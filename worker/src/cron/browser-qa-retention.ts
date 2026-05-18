import type { SupabaseClient } from '@supabase/supabase-js'

import type { Config } from '../config.js'
import { buildBrowserQaArtifactStore } from '../agent-ops/browser-qa/gateway/artifact-store.js'
import { redact } from '../utils/pii-redactor.js'

const BATCH_SIZE = 250

type ExpiredSessionRow = {
  id: string
  org_id: string
  ops_run_id: string
  session_key: string
}

type ArtifactUsageRow = {
  id: string
  metadata: Record<string, unknown> | null
}

export async function cleanupBrowserQaRetention(
  supabase: SupabaseClient,
  config: Config,
): Promise<void> {
  const now = new Date().toISOString()
  const cutoff = new Date(
    Date.now() - config.BROWSER_QA_ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const artifactStore = buildBrowserQaArtifactStore({
    storeKind: config.BROWSER_QA_ARTIFACT_STORE,
    artifactDir: config.BROWSER_QA_ARTIFACT_DIR,
    bucket: config.BROWSER_QA_ARTIFACT_BUCKET,
    publicBaseUrl: config.BROWSER_QA_PUBLIC_BASE_URL,
    supabase,
  })

  try {
    const expiredSessions = await loadExpiredSessions(supabase, now)
    let artifactDeleteCount = 0
    let expiredSessionCount = 0

    for (const session of expiredSessions) {
      const artifactKeys = await loadArtifactKeysForSession(supabase, session)
      artifactDeleteCount += await deleteArtifacts(artifactStore, artifactKeys)

      const { error } = await supabase
        .from('agent_ops_browser_qa_sessions')
        .update({
          status: 'expired',
          completed_at: now,
        })
        .eq('id', session.id)

      if (error) {
        console.error('[cron:browser-qa-retention] session expiry update error:', redact(error.message))
      } else {
        expiredSessionCount += 1
      }
    }

    const oldArtifactRows = await loadOldArtifactUsageRows(supabase, cutoff)
    artifactDeleteCount += await deleteArtifacts(
      artifactStore,
      oldArtifactRows.flatMap(extractArtifactKey),
    )

    const oldUsageDeleted = await deleteOldUsageEvents(supabase, cutoff)

    if (expiredSessionCount > 0 || artifactDeleteCount > 0 || oldUsageDeleted > 0) {
      console.log(
        `[cron:browser-qa-retention] expired ${expiredSessionCount} sessions, ` +
        `deleted ${artifactDeleteCount} artifacts, ${oldUsageDeleted} usage events`,
      )
    }
  } catch (error) {
    console.error('[cron:browser-qa-retention] Error:', redact(error instanceof Error ? error.message : String(error)))
  }
}

async function loadExpiredSessions(
  supabase: SupabaseClient,
  now: string,
): Promise<ExpiredSessionRow[]> {
  const { data, error } = await supabase
    .from('agent_ops_browser_qa_sessions')
    .select('id, org_id, ops_run_id, session_key')
    .lt('expires_at', now)
    .neq('status', 'expired')
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron:browser-qa-retention] expired session query error:', redact(error.message))
    return []
  }

  return (data ?? []) as ExpiredSessionRow[]
}

async function loadArtifactKeysForSession(
  supabase: SupabaseClient,
  session: ExpiredSessionRow,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('agent_ops_browser_qa_usage_events')
    .select('id, metadata')
    .eq('org_id', session.org_id)
    .eq('ops_run_id', session.ops_run_id)
    .eq('session_key', session.session_key)
    .eq('event_type', 'artifact_written')
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron:browser-qa-retention] artifact usage query error:', error.message)
    return []
  }

  return ((data ?? []) as ArtifactUsageRow[]).flatMap(extractArtifactKey)
}

async function loadOldArtifactUsageRows(
  supabase: SupabaseClient,
  cutoff: string,
): Promise<ArtifactUsageRow[]> {
  const { data, error } = await supabase
    .from('agent_ops_browser_qa_usage_events')
    .select('id, metadata')
    .eq('event_type', 'artifact_written')
    .lt('created_at', cutoff)
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron:browser-qa-retention] old artifact usage query error:', error.message)
    return []
  }

  return (data ?? []) as ArtifactUsageRow[]
}

async function deleteOldUsageEvents(
  supabase: SupabaseClient,
  cutoff: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('agent_ops_browser_qa_usage_events')
    .delete()
    .lt('created_at', cutoff)
    .limit(BATCH_SIZE)
    .select('id')

  if (error) {
    console.error('[cron:browser-qa-retention] old usage cleanup error:', error.message)
    return 0
  }

  return data?.length ?? 0
}

async function deleteArtifacts(
  artifactStore: ReturnType<typeof buildBrowserQaArtifactStore>,
  rawKeys: string[],
): Promise<number> {
  const keys = Array.from(new Set(rawKeys.filter(Boolean)))
  if (keys.length === 0) return 0

  try {
    const result = await artifactStore.deleteMany(keys)
    return result.deleted
  } catch (error) {
    console.error(
      '[cron:browser-qa-retention] artifact cleanup error:',
      error instanceof Error ? error.message : error,
    )
    return 0
  }
}

function extractArtifactKey(row: ArtifactUsageRow): string[] {
  const key = row.metadata?.artifactKey
  return typeof key === 'string' && key.trim().length > 0 ? [key] : []
}
