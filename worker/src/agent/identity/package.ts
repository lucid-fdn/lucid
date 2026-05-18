import type { SupabaseClient } from '@supabase/supabase-js'

interface IdentityDocumentRow {
  document_type: string
  status: string
  content: Record<string, unknown>
  version: number
}

interface SharedContextRecordRow {
  scope_type: string
  scope_id: string
  record_type: string
  title: string
  body: string
  confidence: number | null
  status: string
  valid_from: string | null
  valid_until: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

const IDENTITY_ORDER = [
  'SOUL',
  'USER',
  'HEARTBEAT',
  'MEMORY_POLICY',
  'ACCESS_POLICY',
  'TOOL_POLICY',
  'CURRENT_CONTEXT',
]

const SHARED_CONTEXT_ORDER = [
  'thesis',
  'policy',
  'decision',
  'risk',
  'open_question',
  'signal',
  'feedback',
  'daily_intel',
  'memory',
]

const SHARED_CONTEXT_LABELS: Record<string, string> = {
  thesis: 'What We Believe',
  policy: 'Operating Policy',
  decision: 'Decisions',
  risk: 'Risks',
  open_question: 'Open Questions',
  signal: 'Signals',
  feedback: 'Feedback',
  daily_intel: 'Daily Intel',
  memory: 'Shared Memory',
}

export async function loadAgentIdentityPromptSections(
  supabase: SupabaseClient | undefined,
  agentId: string,
): Promise<string[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('agent_identity_documents')
    .select('document_type, status, content, version')
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .order('version', { ascending: false })

  if (error || !data?.length) return []

  const latest = new Map<string, IdentityDocumentRow>()
  for (const row of data as IdentityDocumentRow[]) {
    if (!latest.has(row.document_type)) latest.set(row.document_type, row)
  }

  return IDENTITY_ORDER
    .map((documentType) => latest.get(documentType))
    .filter((row): row is IdentityDocumentRow => Boolean(row))
    .map((row) => {
      const summary = typeof row.content.summary === 'string' ? row.content.summary.trim() : ''
      if (row.content.source === 'agent_card' && summary) return `## ${row.document_type}\n${summary}`
      return `## ${row.document_type}\n${JSON.stringify(row.content, null, 2)}`
    })
}

function isContextRecordCurrent(row: SharedContextRecordRow, now = Date.now()): boolean {
  if (row.status !== 'active') return false
  if (row.valid_from && Date.parse(row.valid_from) > now) return false
  if (row.valid_until && Date.parse(row.valid_until) <= now) return false
  return true
}

function contextScopeKey(row: Pick<SharedContextRecordRow, 'scope_type' | 'scope_id'>): string {
  return `${row.scope_type}:${row.scope_id}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function scopePrecedence(scopeType: string): number {
  if (scopeType === 'workspace') return 1
  if (scopeType === 'project') return 2
  if (scopeType === 'team') return 3
  if (scopeType === 'agent') return 4
  if (scopeType === 'user') return 5
  return 0
}

function policyPayload(row: SharedContextRecordRow): Record<string, unknown> {
  const raw = row.metadata?.policy
  return isPlainObject(raw) ? raw : { note: row.body }
}

function buildMergedPolicySection(records: SharedContextRecordRow[]): string | null {
  const policyRows = records
    .filter((row) => row.record_type === 'policy')
    .sort((a, b) => {
      const precedence = scopePrecedence(a.scope_type) - scopePrecedence(b.scope_type)
      return precedence === 0 ? Date.parse(a.created_at) - Date.parse(b.created_at) : precedence
    })
  if (policyRows.length === 0) return null

  const inheritedPolicy: Record<string, unknown> = {}
  const owners = new Map<string, SharedContextRecordRow>()
  const conflicts: Array<Record<string, unknown>> = []

  for (const row of policyRows) {
    for (const [key, value] of Object.entries(policyPayload(row))) {
      const owner = owners.get(key)
      if (owner && JSON.stringify(inheritedPolicy[key]) !== JSON.stringify(value)) {
        conflicts.push({
          key,
          previousScope: owner.scope_type,
          overrideScope: row.scope_type,
          previousTitle: owner.title,
          overrideTitle: row.title,
        })
      }
      inheritedPolicy[key] = value
      owners.set(key, row)
    }
  }

  const sources = policyRows.map((row) => ({
    scope: row.scope_type,
    id: row.scope_id,
    title: row.title,
    confidence: row.confidence,
    createdAt: row.created_at,
  }))
  return `## MERGED_OPERATING_POLICY\n${JSON.stringify({ inheritedPolicy, sources, conflicts }, null, 2)}`
}

async function loadAgentTeamIds(
  supabase: SupabaseClient,
  agentId: string,
  workspaceId: string,
  projectId?: string | null,
): Promise<string[]> {
  let query = supabase
    .from('crew_members')
    .select('crew_id, crews!inner(org_id, project_id, deleted_at)')
    .eq('assistant_id', agentId)
    .eq('crews.org_id', workspaceId)
    .is('crews.deleted_at', null)
    .limit(5)

  if (projectId) query = query.eq('crews.project_id', projectId)

  const { data, error } = await query
  if (error || !data?.length) return []

  return [...new Set(data.map((row: { crew_id?: string | null }) => row.crew_id).filter((id): id is string => Boolean(id)))]
}

export async function loadSharedContextPromptSections(
  supabase: SupabaseClient | undefined,
  input: {
    workspaceId?: string | null
    projectId?: string | null
    agentId: string
    userId?: string | null
  },
): Promise<string[]> {
  if (!supabase || !input.workspaceId) return []

  const teamIds = await loadAgentTeamIds(supabase, input.agentId, input.workspaceId, input.projectId)
  const scopeKeys = new Set<string>([
    `workspace:${input.workspaceId}`,
    ...(input.projectId ? [`project:${input.projectId}`] : []),
    ...teamIds.map((teamId) => `team:${teamId}`),
    `agent:${input.agentId}`,
    ...(input.userId ? [`user:${input.userId}`] : []),
  ])

  const { data, error } = await supabase
    .from('shared_context_records')
    .select('scope_type, scope_id, record_type, title, body, confidence, status, valid_from, valid_until, metadata, created_at')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(250)

  if (error || !data?.length) return []

  const records = (data as SharedContextRecordRow[])
    .filter((row) => scopeKeys.has(contextScopeKey(row)))
    .filter((row) => isContextRecordCurrent(row))

  const sections: string[] = []
  const mergedPolicy = buildMergedPolicySection(records)
  if (mergedPolicy) sections.push(mergedPolicy)
  for (const recordType of SHARED_CONTEXT_ORDER) {
    const rows = records
      .filter((row) => row.record_type === recordType)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, recordType === 'signal' || recordType === 'feedback' ? 8 : 5)

    if (rows.length === 0) continue

    sections.push(`## ${SHARED_CONTEXT_LABELS[recordType] ?? recordType}\n${rows.map((row) => {
      const confidence = typeof row.confidence === 'number' ? ` confidence=${row.confidence.toFixed(2)}` : ''
      return `- [${row.scope_type}] ${row.title}${confidence}: ${row.body}`
    }).join('\n')}`)
  }

  return sections
}
