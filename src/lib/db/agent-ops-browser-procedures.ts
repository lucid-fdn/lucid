import 'server-only'

import {
  buildBrowserProcedureContentHash,
  createBrowserProcedureInputSchema,
  createBrowserProcedureVersionInputSchema,
  listBrowserProceduresInputSchema,
  normalizeBrowserProcedureSlug,
  rankBrowserProcedureMatches,
  type AgentOpsBrowserProcedure,
  type AgentOpsBrowserProcedureVersion,
  type CreateBrowserProcedureInput,
  type CreateBrowserProcedureVersionInput,
  type ListBrowserProceduresInput,
} from '@/lib/agent-ops/browser-procedures'
import { ErrorService, supabase } from './client'

type BrowserProcedureRow = {
  id: string
  org_id: string
  project_id: string | null
  host_pattern: string
  name: string
  slug: string
  description: string
  intent_triggers: string[] | null
  procedure_type: AgentOpsBrowserProcedure['procedureType']
  scope: AgentOpsBrowserProcedure['scope']
  trust_state: AgentOpsBrowserProcedure['trustState']
  source_run_id: string | null
  created_by_user_id: string | null
  created_by_agent_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type BrowserProcedureVersionRow = {
  id: string
  procedure_id: string
  version: number
  definition_kind: AgentOpsBrowserProcedureVersion['definitionKind']
  definition: Record<string, unknown>
  fixture_artifact_id: string | null
  test_definition: Record<string, unknown> | null
  capabilities: string[] | null
  risk_level: AgentOpsBrowserProcedureVersion['riskLevel']
  approval_policy: Record<string, unknown> | null
  content_hash: string
  created_by_user_id: string | null
  created_at: string
}

const BROWSER_PROCEDURE_SELECT = `
  id,
  org_id,
  project_id,
  host_pattern,
  name,
  slug,
  description,
  intent_triggers,
  procedure_type,
  scope,
  trust_state,
  source_run_id,
  created_by_user_id,
  created_by_agent_id,
  metadata,
  created_at,
  updated_at
`

const BROWSER_PROCEDURE_VERSION_SELECT = `
  id,
  procedure_id,
  version,
  definition_kind,
  definition,
  fixture_artifact_id,
  test_definition,
  capabilities,
  risk_level,
  approval_policy,
  content_hash,
  created_by_user_id,
  created_at
`

export async function createAgentOpsBrowserProcedure(
  input: CreateBrowserProcedureInput,
): Promise<AgentOpsBrowserProcedure> {
  const parsed = createBrowserProcedureInputSchema.parse(input)
  const slug = normalizeBrowserProcedureSlug(parsed.slug ?? parsed.name)

  const { data, error } = await supabase
    .from('agent_ops_browser_procedures')
    .insert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      host_pattern: parsed.hostPattern,
      name: parsed.name,
      slug,
      description: parsed.description,
      intent_triggers: parsed.intentTriggers,
      procedure_type: parsed.procedureType,
      scope: parsed.scope,
      trust_state: parsed.trustState,
      source_run_id: parsed.sourceRunId ?? null,
      created_by_user_id: parsed.createdByUserId ?? null,
      created_by_agent_id: parsed.createdByAgentId ?? null,
      metadata: parsed.metadata,
    })
    .select(BROWSER_PROCEDURE_SELECT)
    .single()

  if (error) {
    captureBrowserProcedureDbError(error, 'createAgentOpsBrowserProcedure', {
      orgId: parsed.orgId,
      projectId: parsed.projectId ?? null,
      slug,
    })
    throw error
  }

  return mapBrowserProcedureRow(data as BrowserProcedureRow)
}

export async function createAgentOpsBrowserProcedureVersion(
  input: CreateBrowserProcedureVersionInput,
): Promise<AgentOpsBrowserProcedureVersion> {
  const parsed = createBrowserProcedureVersionInputSchema.parse(input)
  const contentHash = parsed.contentHash ?? buildBrowserProcedureContentHash({
    definition: parsed.definition,
    testDefinition: parsed.testDefinition,
    capabilities: parsed.capabilities,
    riskLevel: parsed.riskLevel,
    approvalPolicy: parsed.approvalPolicy,
  })

  const version = parsed.version ?? await nextBrowserProcedureVersion(parsed.procedureId)
  const { data, error } = await supabase
    .from('agent_ops_browser_procedure_versions')
    .insert({
      procedure_id: parsed.procedureId,
      version,
      definition_kind: parsed.definitionKind,
      definition: parsed.definition,
      fixture_artifact_id: parsed.fixtureArtifactId ?? null,
      test_definition: parsed.testDefinition,
      capabilities: parsed.capabilities,
      risk_level: parsed.riskLevel,
      approval_policy: parsed.approvalPolicy,
      content_hash: contentHash,
      created_by_user_id: parsed.createdByUserId ?? null,
    })
    .select(BROWSER_PROCEDURE_VERSION_SELECT)
    .single()

  if (error) {
    captureBrowserProcedureDbError(error, 'createAgentOpsBrowserProcedureVersion', {
      procedureId: parsed.procedureId,
      version,
      contentHash,
    })
    throw error
  }

  return mapBrowserProcedureVersionRow(data as BrowserProcedureVersionRow)
}

export async function getAgentOpsBrowserProcedureDetail(input: {
  orgId: string
  procedureId: string
}): Promise<{
  procedure: AgentOpsBrowserProcedure
  versions: AgentOpsBrowserProcedureVersion[]
} | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_procedures')
    .select(BROWSER_PROCEDURE_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.procedureId)
    .maybeSingle()

  if (error) {
    captureBrowserProcedureDbError(error, 'getAgentOpsBrowserProcedureDetail', input)
    throw error
  }
  if (!data) return null

  const versions = await listAgentOpsBrowserProcedureVersions({
    procedureId: input.procedureId,
  })

  return {
    procedure: mapBrowserProcedureRow(data as BrowserProcedureRow),
    versions,
  }
}

export async function getAgentOpsBrowserProcedureBySourceRun(input: {
  orgId: string
  sourceRunId: string
}): Promise<AgentOpsBrowserProcedure | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_procedures')
    .select(BROWSER_PROCEDURE_SELECT)
    .eq('org_id', input.orgId)
    .eq('source_run_id', input.sourceRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    captureBrowserProcedureDbError(error, 'getAgentOpsBrowserProcedureBySourceRun', input)
    throw error
  }

  return data ? mapBrowserProcedureRow(data as BrowserProcedureRow) : null
}

export async function listAgentOpsBrowserProcedureVersions(input: {
  procedureId: string
  limit?: number
}): Promise<AgentOpsBrowserProcedureVersion[]> {
  const { data, error } = await supabase
    .from('agent_ops_browser_procedure_versions')
    .select(BROWSER_PROCEDURE_VERSION_SELECT)
    .eq('procedure_id', input.procedureId)
    .order('version', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 100))

  if (error) {
    captureBrowserProcedureDbError(error, 'listAgentOpsBrowserProcedureVersions', input)
    throw error
  }

  return ((data ?? []) as BrowserProcedureVersionRow[]).map(mapBrowserProcedureVersionRow)
}

export async function updateAgentOpsBrowserProcedureTrustState(input: {
  orgId: string
  procedureId: string
  trustState: AgentOpsBrowserProcedure['trustState']
  metadata?: Record<string, unknown>
}): Promise<AgentOpsBrowserProcedure> {
  const { data, error } = await supabase
    .from('agent_ops_browser_procedures')
    .update({
      trust_state: input.trustState,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
    .eq('org_id', input.orgId)
    .eq('id', input.procedureId)
    .select(BROWSER_PROCEDURE_SELECT)
    .single()

  if (error) {
    captureBrowserProcedureDbError(error, 'updateAgentOpsBrowserProcedureTrustState', input)
    throw error
  }

  return mapBrowserProcedureRow(data as BrowserProcedureRow)
}

export async function listAgentOpsBrowserProcedures(
  input: ListBrowserProceduresInput,
): Promise<AgentOpsBrowserProcedure[]> {
  const parsed = listBrowserProceduresInputSchema.parse(input)
  let query = supabase
    .from('agent_ops_browser_procedures')
    .select(BROWSER_PROCEDURE_SELECT)
    .eq('org_id', parsed.orgId)
    .order('updated_at', { ascending: false })
    .limit(parsed.limit)

  if (parsed.projectId !== undefined) {
    if (parsed.projectId === null) {
      query = query.is('project_id', null)
    } else {
      query = query.or(`project_id.eq.${parsed.projectId},project_id.is.null`)
    }
  }

  if (parsed.trustStates?.length) {
    query = query.in('trust_state', parsed.trustStates)
  }

  if (parsed.procedureTypes?.length) {
    query = query.in('procedure_type', parsed.procedureTypes)
  }

  const { data, error } = await query
  if (error) {
    captureBrowserProcedureDbError(error, 'listAgentOpsBrowserProcedures', {
      orgId: parsed.orgId,
      projectId: parsed.projectId ?? null,
    })
    throw error
  }

  const procedures = ((data ?? []) as BrowserProcedureRow[]).map(mapBrowserProcedureRow)
  if (!parsed.host) return procedures
  return rankBrowserProcedureMatches(procedures, { host: parsed.host }).map((match) => match.procedure)
}

export async function findMatchingAgentOpsBrowserProcedures(input: ListBrowserProceduresInput & {
  intent?: string | null
}): Promise<ReturnType<typeof rankBrowserProcedureMatches>> {
  const procedures = await listAgentOpsBrowserProcedures({
    ...input,
    trustStates: input.trustStates ?? ['active', 'draft'],
  })
  return rankBrowserProcedureMatches(procedures, {
    host: input.host,
    intent: input.intent,
  })
}

export async function recordAgentOpsBrowserProcedureRun(input: {
  procedureId: string
  versionId?: string | null
  opsRunId: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'handoff_required'
  matchedTrigger?: string | null
  durationMs?: number | null
  securityFlags?: unknown[]
  outputSummary?: Record<string, unknown>
  metadata?: Record<string, unknown>
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('agent_ops_browser_procedure_runs')
    .upsert({
      procedure_id: input.procedureId,
      version_id: input.versionId ?? null,
      ops_run_id: input.opsRunId,
      status: input.status ?? 'queued',
      matched_trigger: input.matchedTrigger ?? null,
      duration_ms: input.durationMs ?? null,
      security_flags: input.securityFlags ?? [],
      output_summary: input.outputSummary ?? {},
      metadata: input.metadata ?? {},
    }, { onConflict: 'procedure_id,ops_run_id' })
    .select('id')
    .single()

  if (error) {
    captureBrowserProcedureDbError(error, 'recordAgentOpsBrowserProcedureRun', {
      procedureId: input.procedureId,
      opsRunId: input.opsRunId,
    })
    throw error
  }

  return { id: data.id as string }
}

async function nextBrowserProcedureVersion(procedureId: string): Promise<number> {
  const { data, error } = await supabase
    .from('agent_ops_browser_procedure_versions')
    .select('version')
    .eq('procedure_id', procedureId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    captureBrowserProcedureDbError(error, 'nextBrowserProcedureVersion', { procedureId })
    throw error
  }

  return ((data?.version as number | undefined) ?? 0) + 1
}

function mapBrowserProcedureRow(row: BrowserProcedureRow): AgentOpsBrowserProcedure {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    hostPattern: row.host_pattern,
    name: row.name,
    slug: row.slug,
    description: row.description,
    intentTriggers: row.intent_triggers ?? [],
    procedureType: row.procedure_type,
    scope: row.scope,
    trustState: row.trust_state,
    sourceRunId: row.source_run_id,
    createdByUserId: row.created_by_user_id,
    createdByAgentId: row.created_by_agent_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBrowserProcedureVersionRow(row: BrowserProcedureVersionRow): AgentOpsBrowserProcedureVersion {
  return {
    id: row.id,
    procedureId: row.procedure_id,
    version: row.version,
    definitionKind: row.definition_kind,
    definition: row.definition,
    fixtureArtifactId: row.fixture_artifact_id,
    testDefinition: row.test_definition ?? {},
    capabilities: row.capabilities ?? [],
    riskLevel: row.risk_level,
    approvalPolicy: row.approval_policy ?? {},
    contentHash: row.content_hash,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

function captureBrowserProcedureDbError(
  error: unknown,
  operation: string,
  context: Record<string, unknown>,
) {
  ErrorService.captureException(error, {
    severity: 'error',
    context: {
      operation,
      ...context,
    },
    tags: {
      layer: 'database',
      domain: 'agent_ops_browser_procedures',
    },
  })
}
