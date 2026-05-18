import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DagSpec } from '@contracts/dag'
import { ControlPlaneDagPlanner } from '@/lib/dag/planner'
import { DagReplay } from '@/lib/dag/replay'
import { SchedulerBridge } from '@/lib/dag/scheduler-bridge'
import {
  buildBrowserHostPlaybookRuntimeContext,
  rankBrowserHostPlaybookMatches,
  type AgentOpsBrowserHostPlaybook,
} from './browser-host-playbooks'
import {
  buildBrowserLiveSessionRuntimeContext,
  serializeBrowserLiveSessionForRuntime,
} from './browser-live-sessions'
import {
  buildBrowserSessionSharingRuntimeContext,
  serializeBrowserSessionSharingForRuntime,
} from './browser-session-sharing'
import {
  buildDesignOpsRuntimeContext,
  serializeDesignOpsForRuntime,
} from './design-ops'
import { serializeDecisionPacingForRuntime } from './decision-pacing'
import { rankBrowserProcedureMatches, type AgentOpsBrowserProcedure } from './browser-procedures'
import {
  buildBrowserTrustShieldRuntimeContext,
  serializeBrowserTrustShieldForRuntime,
} from './browser-trust-shield'
import { buildAgentOpsDagSpec } from './workflow-to-dag'
import type { AgentOpsOrchestrationAdapter } from './ports'
import type { AgentOpsRun, AgentOpsWorkflowDefinition } from './workflow-types'

type UuidFn = () => string

export interface AgentOpsDagOrchestrationAdapterOptions {
  supabaseClient: SupabaseClient
  uuid?: UuidFn
  scheduler?: SchedulerBridge
}

interface DagHeader {
  id: string
  org_id: string
  status: string
}

interface DagNodeRef {
  id: string
  node_key: string
  status: string
}

interface BrowserProcedureRow {
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

interface BrowserProcedureVersionRow {
  id: string
  procedure_id: string
  version: number
  definition_kind: string
  definition: Record<string, unknown>
  fixture_artifact_id: string | null
  test_definition: Record<string, unknown> | null
  capabilities: string[] | null
  risk_level: string
  approval_policy: Record<string, unknown> | null
  content_hash: string
  created_at: string
}

interface ResolvedBrowserProcedure {
  procedure: AgentOpsBrowserProcedure
  version: BrowserProcedureVersionRow
  matchScore: number
  matchReasons: string[]
}

interface BrowserHostPlaybookRow {
  id: string
  org_id: string
  project_id: string | null
  host_pattern: string
  title: string
  body_md: string
  scope: AgentOpsBrowserHostPlaybook['scope']
  trust_state: AgentOpsBrowserHostPlaybook['trustState']
  successful_uses: number
  security_flags_count: number
  last_used_at: string | null
  source_run_id: string | null
  created_by_user_id: string | null
  created_by_agent_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export class AgentOpsDagOrchestrationAdapter implements AgentOpsOrchestrationAdapter {
  private readonly supabase: SupabaseClient
  private readonly scheduler: SchedulerBridge
  private readonly uuid?: UuidFn

  constructor(options: AgentOpsDagOrchestrationAdapterOptions) {
    this.supabase = options.supabaseClient
    this.scheduler = options.scheduler ?? new SchedulerBridge(this.supabase)
    this.uuid = options.uuid
  }

  async startDag(input: {
    run: AgentOpsRun
    workflow: AgentOpsWorkflowDefinition
  }): Promise<{ dagId: string }> {
    if (!input.run.assistantId) {
      throw new Error('Agent Ops DAG workflows require an assistant_id execution owner')
    }

    const [browserProcedure, browserHostPlaybooks] = await Promise.all([
      this.resolveBrowserProcedure(input.run, input.workflow),
      this.resolveBrowserHostPlaybooks(input.run, input.workflow),
    ])
    const spec = attachRunContext(
      buildAgentOpsDagSpec(input.workflow),
      input.run,
      input.workflow,
      browserProcedure,
      browserHostPlaybooks,
    )
    const planner = new ControlPlaneDagPlanner(this.supabase, this.uuid)
    const result = await planner.instantiate({
      spec,
      agentId: input.run.assistantId,
      orgId: input.run.orgId,
      source: 'hybrid',
      rootEventId: input.run.id,
      rootEventType: 'scheduled',
    })

    await this.scheduler.onDagCreated(result.dagId)
    return { dagId: result.dagId }
  }

  async cancelDag(input: { orgId: string; dagId: string; reason?: string }): Promise<void> {
    await this.assertDagOwner(input.orgId, input.dagId)

    await this.supabase
      .from('orchestration_dag_nodes')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('dag_id', input.dagId)
      .in('status', ['pending', 'ready', 'running'])

    await this.supabase
      .from('orchestration_steps')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: input.reason ?? 'Agent Ops run cancelled',
      })
      .eq('dag_id', input.dagId)
      .in('status', ['pending', 'claimed', 'running'])

    await this.supabase
      .from('orchestration_dags')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', input.dagId)
      .eq('org_id', input.orgId)
  }

  async retryDag(input: {
    orgId: string
    dagId: string
    fromNodeKey?: string
  }): Promise<{ dagId: string }> {
    const dag = await this.assertDagOwner(input.orgId, input.dagId)
    if (dag.status === 'pending') {
      await this.scheduler.onDagCreated(input.dagId)
      return { dagId: input.dagId }
    }

    const fromNode = await this.findRetryNode(input.dagId, input.fromNodeKey)
    const replay = new DagReplay(this.supabase, null, this.uuid ? { uuid: this.uuid } : {})
    const fork = await replay.fork({
      originalDagId: input.dagId,
      fromNodeId: fromNode.id,
      operatorId: 'agent-ops-retry',
    })
    await this.scheduler.onDagCreated(fork.newDagId)
    return { dagId: fork.newDagId }
  }

  private async assertDagOwner(orgId: string, dagId: string): Promise<DagHeader> {
    const { data, error } = await this.supabase
      .from('orchestration_dags')
      .select('id, org_id, status')
      .eq('id', dagId)
      .maybeSingle()
    if (error) {
      throw new Error(`[agent-ops-dag] load dag failed: ${error.message}`)
    }
    const dag = data as DagHeader | null
    if (!dag || dag.org_id !== orgId) {
      throw new Error('Agent Ops DAG not found')
    }
    return dag
  }

  private async findRetryNode(dagId: string, fromNodeKey?: string): Promise<DagNodeRef> {
    let query = this.supabase
      .from('orchestration_dag_nodes')
      .select('id, node_key, status')
      .eq('dag_id', dagId)

    if (fromNodeKey) {
      query = query.eq('node_key', fromNodeKey)
    } else {
      query = query
        .in('status', ['failed', 'cancelled', 'pending', 'ready', 'running'])
        .order('created_at', { ascending: true })
        .limit(1)
    }

    const { data, error } = await query.maybeSingle()
    if (error) {
      throw new Error(`[agent-ops-dag] find retry node failed: ${error.message}`)
    }
    if (!data) {
      throw new Error('Agent Ops DAG retry point not found')
    }
    return data as DagNodeRef
  }

  private async resolveBrowserProcedure(
    run: AgentOpsRun,
    workflow: AgentOpsWorkflowDefinition,
  ): Promise<ResolvedBrowserProcedure | null> {
    if (!workflowRequiresBrowserOperator(workflow)) return null
    const targetUrl = resolveRunTargetUrl(run)
    if (!targetUrl) return null

    try {
      let query = this.supabase
        .from('agent_ops_browser_procedures')
        .select(`
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
        `)
        .eq('org_id', run.orgId)
        .eq('trust_state', 'active')

      if (run.projectId) {
        query = query.or(`project_id.eq.${run.projectId},project_id.is.null`)
      } else {
        query = query.is('project_id', null)
      }

      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) return null

      const procedures = ((data ?? []) as BrowserProcedureRow[]).map(mapBrowserProcedureRow)
      const [match] = rankBrowserProcedureMatches(procedures, {
        host: targetUrl,
        intent: buildProcedureIntent(run, workflow),
      })
      if (!match) return null

      const { data: versionData, error: versionError } = await this.supabase
        .from('agent_ops_browser_procedure_versions')
        .select(`
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
          created_at
        `)
        .eq('procedure_id', match.procedure.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (versionError || !versionData) return null

      return {
        procedure: match.procedure,
        version: versionData as BrowserProcedureVersionRow,
        matchScore: match.score,
        matchReasons: match.reasons,
      }
    } catch {
      return null
    }
  }

  private async resolveBrowserHostPlaybooks(
    run: AgentOpsRun,
    workflow: AgentOpsWorkflowDefinition,
  ): Promise<Array<Record<string, unknown>>> {
    if (!workflowRequiresBrowserOperator(workflow)) return []
    const targetUrl = resolveRunTargetUrl(run)
    if (!targetUrl) return []

    try {
      let query = this.supabase
        .from('agent_ops_browser_host_playbooks')
        .select(`
          id,
          org_id,
          project_id,
          host_pattern,
          title,
          body_md,
          scope,
          trust_state,
          successful_uses,
          security_flags_count,
          last_used_at,
          source_run_id,
          created_by_user_id,
          created_by_agent_id,
          metadata,
          created_at,
          updated_at
        `)
        .eq('org_id', run.orgId)
        .eq('trust_state', 'active')

      if (run.projectId) {
        query = query.or(`project_id.eq.${run.projectId},project_id.is.null`)
      } else {
        query = query.is('project_id', null)
      }

      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .limit(20)
      if (error) return []

      const playbooks = ((data ?? []) as BrowserHostPlaybookRow[]).map(mapBrowserHostPlaybookRow)
      return buildBrowserHostPlaybookRuntimeContext(
        rankBrowserHostPlaybookMatches(playbooks, {
          host: targetUrl,
          intent: buildProcedureIntent(run, workflow),
        }),
      )
    } catch {
      return []
    }
  }
}

function attachRunContext(
  spec: DagSpec,
  run: AgentOpsRun,
  workflow: AgentOpsWorkflowDefinition,
  browserProcedure: ResolvedBrowserProcedure | null,
  browserHostPlaybooks: Array<Record<string, unknown>>,
): DagSpec {
  const defaultRuntimeTarget = resolveDefaultRuntimeTarget(run)
  const targetUrl = resolveRunTargetUrl(run)
  const browserTrustShield = workflowRequiresBrowserOperator(workflow)
    ? buildBrowserTrustShieldRuntimeContext({
        orgId: run.orgId,
        runId: run.id,
        targetUrl,
        classifierEnabled: false,
      })
    : null
  const browserLiveSession = workflowRequiresBrowserOperator(workflow)
    ? buildBrowserLiveSessionRuntimeContext()
    : null
  const browserSessionSharing = workflowRequiresBrowserOperator(workflow)
    ? buildBrowserSessionSharingRuntimeContext()
    : null
  const designOps = workflowRequiresDesignOps(workflow)
    ? buildDesignOpsRuntimeContext()
    : null
  const runContext = {
    run_id: run.id,
    org_id: run.orgId,
    project_id: run.projectId ?? null,
    assistant_id: run.assistantId ?? null,
    workflow_id: workflow.id,
    workflow_version: workflow.version,
    scope: run.scope,
    input: run.input,
    output_sections: workflow.outputSections,
    evidence_types: workflow.evidenceTypes,
    decision_pacing: serializeDecisionPacingForRuntime(),
    ...(browserProcedure
      ? {
          browser_procedure: serializeBrowserProcedureForRuntime(browserProcedure),
        }
      : {}),
    ...(browserHostPlaybooks.length > 0
      ? {
          browser_host_playbooks: browserHostPlaybooks,
        }
      : {}),
    ...(browserTrustShield
      ? {
          browser_trust_shield: serializeBrowserTrustShieldForRuntime(browserTrustShield),
          security_canaries: browserTrustShield.canaries,
        }
      : {}),
    ...(browserLiveSession
      ? {
          browser_live_session: serializeBrowserLiveSessionForRuntime(browserLiveSession),
        }
      : {}),
    ...(browserSessionSharing
      ? {
          browser_session_sharing: serializeBrowserSessionSharingForRuntime(browserSessionSharing),
        }
      : {}),
    ...(designOps
      ? {
          design_ops: serializeDesignOpsForRuntime(designOps),
        }
      : {}),
  }

  return {
    ...spec,
    nodes: spec.nodes.map((node) => {
      const payload = node.payload && typeof node.payload === 'object'
        ? node.payload as Record<string, unknown>
        : {}
      const agentOps = payload.agent_ops && typeof payload.agent_ops === 'object'
        ? payload.agent_ops as Record<string, unknown>
        : {}

      return {
        ...node,
        runtime_target: node.runtime_target ?? defaultRuntimeTarget,
        payload: {
          ...payload,
          agent_ops: {
            ...agentOps,
            ...runContext,
          },
        },
      }
    }),
    metadata: {
      ...(spec.metadata ?? {}),
      agent_ops: {
        ...(spec.metadata?.agent_ops && typeof spec.metadata.agent_ops === 'object'
          ? spec.metadata.agent_ops
          : {}),
        ...runContext,
      },
    },
  }
}

function serializeBrowserProcedureForRuntime(match: ResolvedBrowserProcedure): Record<string, unknown> {
  return {
    id: match.procedure.id,
    name: match.procedure.name,
    slug: match.procedure.slug,
    host_pattern: match.procedure.hostPattern,
    procedure_type: match.procedure.procedureType,
    trust_state: match.procedure.trustState,
    match_score: match.matchScore,
    match_reasons: match.matchReasons,
    version: {
      id: match.version.id,
      version: match.version.version,
      definition_kind: match.version.definition_kind,
      definition: match.version.definition,
      fixture_artifact_id: match.version.fixture_artifact_id,
      test_definition: match.version.test_definition ?? {},
      capabilities: match.version.capabilities ?? [],
      risk_level: match.version.risk_level,
      approval_policy: match.version.approval_policy ?? {},
      content_hash: match.version.content_hash,
    },
  }
}

function workflowRequiresBrowserOperator(workflow: AgentOpsWorkflowDefinition): boolean {
  return workflow.requiredCapabilities.includes('tool:browser')
    || workflow.requiredCapabilities.includes('advanced:browser-qa')
    || workflow.evidenceTypes.some((type) =>
      type === 'screenshot'
      || type === 'console_log'
      || type === 'network_log'
      || type === 'perf_metric'
    )
}

function workflowRequiresDesignOps(workflow: AgentOpsWorkflowDefinition): boolean {
  return workflow.requiredCapabilities.includes('design:taste-profile')
    || workflow.evidenceTypes.some((type) =>
      type === 'mockup'
      || type === 'variant_board'
      || type === 'design_rationale'
    )
}

function resolveRunTargetUrl(run: AgentOpsRun): string | null {
  for (const candidate of [
    run.input.target,
    run.input.url,
    run.input.deployUrl,
    run.input.deploy_url,
    run.scope.ref,
  ]) {
    const normalized = normalizeHttpUrl(candidate)
    if (normalized) return normalized
  }
  return null
}

function buildProcedureIntent(run: AgentOpsRun, workflow: AgentOpsWorkflowDefinition): string {
  return [
    workflow.id,
    workflow.name,
    run.scope.label,
    run.scope.ref,
    getString(run.input.goal),
    getString(run.input.scenario),
  ].filter(Boolean).join(' ')
}

function normalizeHttpUrl(value: unknown): string | null {
  const raw = getString(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
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

function mapBrowserHostPlaybookRow(row: BrowserHostPlaybookRow): AgentOpsBrowserHostPlaybook {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    hostPattern: row.host_pattern,
    title: row.title,
    bodyMd: row.body_md,
    scope: row.scope,
    trustState: row.trust_state,
    successfulUses: row.successful_uses,
    securityFlagsCount: row.security_flags_count,
    lastUsedAt: row.last_used_at,
    sourceRunId: row.source_run_id,
    createdByUserId: row.created_by_user_id,
    createdByAgentId: row.created_by_agent_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function resolveDefaultRuntimeTarget(run: AgentOpsRun): 'shared' | 'dedicated' {
  const teamOps = readRecord(run.metadata.team_ops)
  const compatibleProfiles = readStringArray(teamOps.compatibleRuntimeProfiles)
  const hasShared = compatibleProfiles.includes('shared')
  const hasDedicated = compatibleProfiles.some((profile) =>
    profile === 'c1_managed' || profile === 'c2a_autonomous'
  )

  if (hasShared && !hasDedicated) return 'shared'
  return 'dedicated'
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
