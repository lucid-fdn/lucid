import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../config.js'

export interface GenerateDailyIntelInput {
  supabase: SupabaseClient
  workspaceId: string
  projectId?: string | null
  agentId?: string | null
  scopeType?: 'workspace' | 'project' | 'team' | 'agent' | 'user'
  scopeId?: string
  title?: string
  body: string
  metadata?: Record<string, unknown>
}

interface ContextSeedRow {
  id: string
  workspace_id: string
  project_id: string | null
  scope_type: string
  scope_id: string
  record_type: string
  title: string
  body: string
  confidence: number | null
  created_at: string
}

export async function generateDailyIntelRecord(input: GenerateDailyIntelInput): Promise<string | null> {
  const scopeType = input.scopeType ?? (input.agentId ? 'agent' : input.projectId ? 'project' : 'workspace')
  const scopeId = input.scopeId ?? input.agentId ?? input.projectId ?? input.workspaceId

  const { data: contextRecord, error: contextError } = await input.supabase
    .from('shared_context_records')
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId ?? null,
      agent_id: input.agentId ?? null,
      scope_type: scopeType,
      scope_id: scopeId,
      record_type: 'daily_intel',
      title: input.title ?? 'Daily Intel',
      body: input.body,
      source_type: 'worker',
      source_id: 'daily-intel',
      confidence: 1,
      status: 'active',
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()

  if (contextError || !contextRecord) return null

  await input.supabase
    .from('daily_intel_runs')
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId ?? null,
      agent_id: input.agentId ?? null,
      status: 'completed',
      summary: input.body.slice(0, 1000),
      context_record_id: contextRecord.id,
      completed_at: new Date().toISOString(),
    })

  return contextRecord.id as string
}

export async function runDailyIntelRollups(
  supabase: SupabaseClient,
  config: ReturnType<typeof getConfig>,
): Promise<void> {
  const batchSize = config.DAILY_INTEL_WORKSPACE_BATCH_SIZE
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: workspaces, error: workspaceError } = await supabase
    .from('organizations')
    .select('id, name')
    .limit(batchSize)

  if (workspaceError || !workspaces?.length) return

  for (const workspace of workspaces as Array<{ id: string; name?: string | null }>) {
    await rollupWorkspaceDailyIntel(supabase, workspace.id, workspace.name ?? 'Workspace', since).catch((err) => {
      console.warn('[daily-intel] workspace rollup failed:', err instanceof Error ? err.message : err)
    })
  }
}

async function rollupWorkspaceDailyIntel(
  supabase: SupabaseClient,
  workspaceId: string,
  workspaceName: string,
  since: string,
): Promise<void> {
  const alreadyRan = await hasRecentDailyIntel(supabase, workspaceId, 'workspace', workspaceId, since)
  if (alreadyRan) return

  const { data, error } = await supabase
    .from('shared_context_records')
    .select('id, workspace_id, project_id, scope_type, scope_id, record_type, title, body, confidence, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .in('record_type', ['signal', 'feedback', 'decision', 'risk', 'open_question'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error || !data?.length) return

  const rows = data as ContextSeedRow[]
  const body = buildIntelSummary(rows)
  if (!body) return

  await generateDailyIntelRecord({
    supabase,
    workspaceId,
    scopeType: 'workspace',
    scopeId: workspaceId,
    title: `Daily Intel: ${workspaceName}`,
    body,
    metadata: {
      generated_by: 'daily-intel-rollup',
      seed_record_ids: rows.slice(0, 25).map((row) => row.id),
      since,
    },
  })

  const projectGroups = groupByProject(rows)
  for (const [projectId, projectRows] of projectGroups) {
    if (await hasRecentDailyIntel(supabase, workspaceId, 'project', projectId, since)) continue

    const projectBody = buildIntelSummary(projectRows)
    if (!projectBody) continue

    await generateDailyIntelRecord({
      supabase,
      workspaceId,
      projectId,
      scopeType: 'project',
      scopeId: projectId,
      title: 'Project Daily Intel',
      body: projectBody,
      metadata: {
        generated_by: 'daily-intel-rollup',
        seed_record_ids: projectRows.slice(0, 25).map((row) => row.id),
        since,
      },
    })
  }
}

async function hasRecentDailyIntel(
  supabase: SupabaseClient,
  workspaceId: string,
  scopeType: string,
  scopeId: string,
  since: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('shared_context_records')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId)
    .eq('record_type', 'daily_intel')
    .eq('source_id', 'daily-intel')
    .gte('created_at', since)

  return (count ?? 0) > 0
}

function groupByProject(rows: ContextSeedRow[]): Map<string, ContextSeedRow[]> {
  const groups = new Map<string, ContextSeedRow[]>()
  for (const row of rows) {
    if (!row.project_id) continue
    const group = groups.get(row.project_id) ?? []
    group.push(row)
    groups.set(row.project_id, group)
  }
  return groups
}

function buildIntelSummary(rows: ContextSeedRow[]): string {
  const grouped = new Map<string, ContextSeedRow[]>()
  for (const row of rows) {
    const group = grouped.get(row.record_type) ?? []
    group.push(row)
    grouped.set(row.record_type, group)
  }

  return ['decision', 'risk', 'open_question', 'signal', 'feedback']
    .flatMap((type) => {
      const group = grouped.get(type)?.slice(0, 8) ?? []
      return group.map((row) => {
        const confidence = typeof row.confidence === 'number' ? ` confidence=${row.confidence.toFixed(2)}` : ''
        return `- [${type}/${row.scope_type}] ${row.title}${confidence}: ${row.body}`
      })
    })
    .join('\n')
}
