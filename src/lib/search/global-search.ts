import 'server-only'

import type {
  GlobalSearchRequest,
  GlobalSearchResponse,
  GlobalSearchResult,
  GlobalSearchScope,
} from '@contracts/global-search'
import { ErrorService, supabase } from '@/lib/db/client'

type SearchCollector = () => Promise<GlobalSearchResult[]>

const DEFAULT_COLLECTOR_LIMIT = 12

export async function globalSearch(input: GlobalSearchRequest): Promise<GlobalSearchResponse> {
  const started = Date.now()
  const scopes = normalizeScopes(input.scopes)
  const collectorLimit = Math.min(Math.max(input.limit, 1), 100)
  const perCollectorLimit = Math.min(DEFAULT_COLLECTOR_LIMIT, collectorLimit)
  const baseHref = input.workspaceSlug ? `/${input.workspaceSlug}` : ''

  const collectors: Array<{ scope: GlobalSearchScope; collect: SearchCollector }> = []
  if (includesScope(scopes, 'runs')) collectors.push({ scope: 'runs', collect: () => searchRuns(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'knowledge')) collectors.push({ scope: 'knowledge', collect: () => searchKnowledgePages(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'claims')) collectors.push({ scope: 'claims', collect: () => searchKnowledgeClaims(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'sources')) collectors.push({ scope: 'sources', collect: () => searchKnowledgeSources(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'agents')) collectors.push({ scope: 'agents', collect: () => searchAgents(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'teams')) collectors.push({ scope: 'teams', collect: () => searchTeams(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'projects')) collectors.push({ scope: 'projects', collect: () => searchProjects(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'evidence')) collectors.push({ scope: 'evidence', collect: () => searchEvidence(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'commerce')) collectors.push({ scope: 'commerce', collect: () => searchCommerceEvents(input, baseHref, perCollectorLimit) })
  if (includesScope(scopes, 'procedures')) collectors.push({ scope: 'procedures', collect: () => searchProcedures(input, baseHref, perCollectorLimit) })

  const settled = await Promise.allSettled(collectors.map((collector) => collector.collect()))
  const warnings: string[] = []
  const results = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value
    const scope = collectors[index]?.scope ?? 'all'
    warnings.push(`${scope}: ${(result.reason as Error)?.message ?? 'collector failed'}`)
    return []
  })

  const fused = fuseResults(results, input.query).slice(0, collectorLimit)
  const countsByType = fused.reduce<Record<string, number>>((counts, result) => {
    counts[result.type] = (counts[result.type] ?? 0) + 1
    return counts
  }, {})

  return {
    query: input.query,
    scopes,
    results: fused,
    countsByType: countsByType as GlobalSearchResponse['countsByType'],
    partial: warnings.length > 0,
    warnings,
    durationMs: Date.now() - started,
  }
}

function normalizeScopes(scopes: GlobalSearchScope[]): GlobalSearchScope[] {
  return scopes.length === 0 ? ['all'] : scopes
}

function includesScope(scopes: GlobalSearchScope[], scope: GlobalSearchScope): boolean {
  return scopes.includes('all') || scopes.includes(scope)
}

function queryPattern(query: string): string {
  return `%${query.trim().replace(/[%_]/g, (char) => `\\${char}`)}%`
}

function scoreText(query: string, ...values: Array<string | null | undefined>): number {
  const q = query.trim().toLowerCase()
  const joined = values.filter(Boolean).join(' ').toLowerCase()
  if (!joined) return 0.1
  if (joined === q) return 1
  if (joined.includes(q)) return 0.75
  return 0.35
}

function fuseResults(results: GlobalSearchResult[], query: string): GlobalSearchResult[] {
  const seen = new Map<string, GlobalSearchResult>()
  for (const result of results) {
    const key = `${result.type}:${result.id}`
    const existing = seen.get(key)
    if (!existing || existing.score < result.score) seen.set(key, result)
  }
  return [...seen.values()]
    .map((result) => ({ ...result, score: result.score + scoreText(query, result.title, result.subtitle, result.snippet) }))
    .sort((a, b) => b.score - a.score)
}

async function safeQuery<T>(scope: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { scope, operation: 'globalSearch' },
      tags: { layer: 'database', table: scope },
    })
    return []
  }
  return (data ?? []) as T[]
}

async function searchRuns(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    project_id: string | null
    workflow_id: string
    status: string
    scope_label: string | null
    scope_ref: string | null
    error_message: string | null
    created_at: string
    updated_at: string
  }>('agent_ops_runs', supabase
    .from('agent_ops_runs')
    .select('id, org_id, project_id, workflow_id, status, scope_label, scope_ref, error_message, created_at, updated_at')
    .eq('org_id', input.orgId)
    .or(`workflow_id.ilike.${queryPattern(input.query)},scope_label.ilike.${queryPattern(input.query)},scope_ref.ilike.${queryPattern(input.query)},error_message.ilike.${queryPattern(input.query)}`)
    .order('created_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => ({
    id: row.id,
    type: 'runs',
    title: `${humanize(row.workflow_id)} run`,
    subtitle: row.scope_label ?? row.scope_ref ?? row.status,
    snippet: row.error_message,
    href: `${baseHref}/mission-control/agent-ops?run=${row.id}`,
    score: scoreText(input.query, row.workflow_id, row.scope_label, row.scope_ref, row.error_message),
    orgId: row.org_id,
    projectId: row.project_id,
    status: row.status,
    updatedAt: row.updated_at ?? row.created_at,
    metadata: { workflow_id: row.workflow_id },
  }))
}

async function searchKnowledgePages(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  let query = supabase
    .from('knowledge_pages')
    .select('id, org_id, project_id, team_id, subject, compiled_truth, status, trust_level, confidence, updated_at')
    .eq('org_id', input.orgId)
    .or(`subject.ilike.${queryPattern(input.query)},compiled_truth.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)

  const rows = await safeQuery<{
    id: string
    org_id: string
    project_id: string | null
    team_id: string | null
    subject: string
    compiled_truth: string
    status: string
    trust_level: string
    confidence: number | string
    updated_at: string
  }>('knowledge_pages', query)

  return rows.map((row) => ({
    id: row.id,
    type: 'knowledge',
    title: row.subject,
    subtitle: `${row.trust_level} confidence ${Number(row.confidence ?? 0).toFixed(2)}`,
    snippet: row.compiled_truth.slice(0, 500),
    href: `${baseHref}/mission-control/knowledge?page=${row.id}`,
    score: scoreText(input.query, row.subject, row.compiled_truth),
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    status: row.status,
    updatedAt: row.updated_at,
    metadata: { trust_level: row.trust_level },
  }))
}

async function searchKnowledgeClaims(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  let query = supabase
    .from('knowledge_claims')
    .select('id, org_id, project_id, team_id, subject, claim, claim_type, status, confidence, updated_at')
    .eq('org_id', input.orgId)
    .or(`subject.ilike.${queryPattern(input.query)},claim.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.teamId) query = query.eq('team_id', input.teamId)

  const rows = await safeQuery<{
    id: string
    org_id: string
    project_id: string | null
    team_id: string | null
    subject: string
    claim: string
    claim_type: string
    status: string
    confidence: number | string
    updated_at: string
  }>('knowledge_claims', query)

  return rows.map((row) => ({
    id: row.id,
    type: 'claims',
    title: row.subject,
    subtitle: `${row.claim_type} · confidence ${Number(row.confidence ?? 0).toFixed(2)}`,
    snippet: row.claim,
    href: `${baseHref}/mission-control/knowledge?claim=${row.id}`,
    score: scoreText(input.query, row.subject, row.claim),
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    status: row.status,
    updatedAt: row.updated_at,
    metadata: { claim_type: row.claim_type },
  }))
}

async function searchKnowledgeSources(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    project_id: string | null
    team_id: string | null
    label: string | null
    source_ref: string | null
    source_type: string
    status: string | null
    updated_at: string
  }>('knowledge_sources', supabase
    .from('knowledge_sources')
    .select('id, org_id, project_id, team_id, label, source_ref, source_type, status, updated_at')
    .eq('org_id', input.orgId)
    .or(`label.ilike.${queryPattern(input.query)},source_ref.ilike.${queryPattern(input.query)},source_type.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => ({
    id: row.id,
    type: 'sources',
    title: row.label ?? row.source_ref ?? row.source_type,
    subtitle: row.source_type,
    snippet: row.source_ref,
    href: `${baseHref}/knowledge?sources=${row.id}`,
    score: scoreText(input.query, row.label, row.source_ref, row.source_type),
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    status: row.status ?? 'active',
    updatedAt: row.updated_at,
    metadata: { source_type: row.source_type },
  }))
}

async function searchAgents(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    name: string
    description: string | null
    engine: string | null
    updated_at: string
  }>('ai_assistants', supabase
    .from('ai_assistants')
    .select('id, org_id, name, description, engine, updated_at')
    .eq('org_id', input.orgId)
    .or(`name.ilike.${queryPattern(input.query)},description.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => ({
    id: row.id,
    type: 'agents',
    title: row.name,
    subtitle: row.engine,
    snippet: row.description,
    href: `${baseHref}/mission-control/agents/${row.id}`,
    score: scoreText(input.query, row.name, row.description),
    orgId: row.org_id,
    updatedAt: row.updated_at,
    metadata: { engine: row.engine },
  }))
}

async function searchTeams(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    project_id: string | null
    name: string
    description: string | null
    updated_at: string
  }>('crews', supabase
    .from('crews')
    .select('id, org_id, project_id, name, description, updated_at')
    .eq('org_id', input.orgId)
    .or(`name.ilike.${queryPattern(input.query)},description.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit))

  const projectIds = [...new Set(rows.map((row) => row.project_id).filter((id): id is string => Boolean(id)))]
  const projects = projectIds.length > 0
    ? await safeQuery<{
        id: string
        slug: string
      }>('projects', supabase
        .from('projects')
        .select('id, slug')
        .eq('org_id', input.orgId)
        .is('deleted_at', null)
        .in('id', projectIds))
    : []
  const projectSlugById = new Map(projects.map((project) => [project.id, project.slug]))

  return rows.map((row) => ({
    id: row.id,
    type: 'teams',
    title: row.name,
    subtitle: 'Team',
    snippet: row.description,
    href: row.project_id && projectSlugById.has(row.project_id)
      ? `${baseHref}/projects/${projectSlugById.get(row.project_id)}/teams/${row.id}`
      : `${baseHref}/projects`,
    score: scoreText(input.query, row.name, row.description),
    orgId: row.org_id,
    projectId: row.project_id,
    updatedAt: row.updated_at,
    metadata: row.project_id ? { projectSlug: projectSlugById.get(row.project_id) } : {},
  }))
}

async function searchProjects(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    name: string
    slug: string
    description: string | null
    updated_at: string
  }>('projects', supabase
    .from('projects')
    .select('id, org_id, name, slug, description, updated_at')
    .eq('org_id', input.orgId)
    .or(`name.ilike.${queryPattern(input.query)},slug.ilike.${queryPattern(input.query)},description.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => ({
    id: row.id,
    type: 'projects',
    title: row.name,
    subtitle: row.slug,
    snippet: row.description,
    href: `${baseHref}/projects/${row.slug}`,
    score: scoreText(input.query, row.name, row.slug, row.description),
    orgId: row.org_id,
    projectId: row.id,
    updatedAt: row.updated_at,
    metadata: { slug: row.slug },
  }))
}

async function searchEvidence(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    ops_run_id: string
    artifact_type: string
    title: string
    summary: string | null
    created_at: string
  }>('agent_ops_artifacts', supabase
    .from('agent_ops_artifacts')
    .select('id, org_id, ops_run_id, artifact_type, title, summary, created_at')
    .eq('org_id', input.orgId)
    .or(`title.ilike.${queryPattern(input.query)},summary.ilike.${queryPattern(input.query)},artifact_type.ilike.${queryPattern(input.query)}`)
    .order('created_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => ({
    id: row.id,
    type: 'evidence',
    title: row.title,
    subtitle: row.artifact_type,
    snippet: row.summary,
    href: `${baseHref}/mission-control/agent-ops?run=${row.ops_run_id}&artifact=${row.id}`,
    score: scoreText(input.query, row.title, row.summary, row.artifact_type),
    orgId: row.org_id,
    updatedAt: row.created_at,
    metadata: { run_id: row.ops_run_id, artifact_type: row.artifact_type },
  }))
}

async function searchCommerceEvents(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const pattern = queryPattern(input.query)
  const rows = await safeQuery<{
    id: string
    org_id: string
    entity_type: string
    entity_id: string
    event_type: string
    provider: string | null
    actor_type: string | null
    request_id: string | null
    run_id: string | null
    payload: Record<string, unknown> | null
    created_at: string
  }>('agent_commerce_events', supabase
    .from('agent_commerce_events')
    .select('id, org_id, entity_type, entity_id, event_type, provider, actor_type, request_id, run_id, payload, created_at')
    .eq('org_id', input.orgId)
    .or(`event_type.ilike.${pattern},provider.ilike.${pattern},entity_type.ilike.${pattern},request_id.ilike.${pattern},run_id.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
    const status = typeof payload.status === 'string' ? payload.status : null
    const projectId = typeof payload.project_id === 'string' ? payload.project_id : null
    const assistantId = typeof payload.assistant_id === 'string' ? payload.assistant_id : null
    const amount = typeof payload.amount === 'number' || typeof payload.amount === 'string' ? String(payload.amount) : null
    const currency = typeof payload.currency === 'string' ? payload.currency : null
    const money = amount && currency ? `${amount} ${currency}` : null

    return {
      id: row.id,
      type: 'commerce' as const,
      title: humanize(row.event_type),
      subtitle: [row.provider, status, money].filter(Boolean).join(' · ') || row.entity_type,
      snippet: [row.entity_type, row.entity_id, row.request_id, row.run_id].filter(Boolean).join(' · '),
      href: `${baseHref}/mission-control/commerce?event=${row.id}`,
      score: scoreText(input.query, row.event_type, row.provider, row.entity_type, row.request_id, row.run_id),
      orgId: row.org_id,
      projectId,
      status,
      updatedAt: row.created_at,
      metadata: {
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        provider: row.provider,
        actor_type: row.actor_type,
        assistant_id: assistantId,
        request_id: row.request_id,
        run_id: row.run_id,
      },
    }
  })
}

async function searchProcedures(input: GlobalSearchRequest, baseHref: string, limit: number): Promise<GlobalSearchResult[]> {
  const rows = await safeQuery<{
    id: string
    org_id: string
    project_id: string | null
    host_pattern: string
    name: string
    description: string
    trust_state: string
    updated_at: string
  }>('agent_ops_browser_procedures', supabase
    .from('agent_ops_browser_procedures')
    .select('id, org_id, project_id, host_pattern, name, description, trust_state, updated_at')
    .eq('org_id', input.orgId)
    .or(`name.ilike.${queryPattern(input.query)},description.ilike.${queryPattern(input.query)},host_pattern.ilike.${queryPattern(input.query)}`)
    .order('updated_at', { ascending: false })
    .limit(limit))

  return rows.map((row) => ({
    id: row.id,
    type: 'procedures',
    title: row.name,
    subtitle: row.host_pattern,
    snippet: row.description,
    href: `${baseHref}/mission-control/agent-ops?procedure=${row.id}`,
    score: scoreText(input.query, row.name, row.description, row.host_pattern),
    orgId: row.org_id,
    projectId: row.project_id,
    status: row.trust_state,
    updatedAt: row.updated_at,
    metadata: { host_pattern: row.host_pattern },
  }))
}

function humanize(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
