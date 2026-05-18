import 'server-only'

import {
  buildDesignVariantFingerprint,
  designFeedbackSchema,
  operatorProfileSchema,
  type AgentOpsDesignFeedback,
  type AgentOpsOperatorProfile,
  type AgentOpsOperatorProfileType,
} from '@/lib/agent-ops/design-ops'
import { ErrorService, supabase } from './client'

type OperatorProfileRow = {
  id: string
  org_id: string
  user_id: string | null
  project_id: string | null
  profile_type: AgentOpsOperatorProfileType
  declared: Record<string, unknown> | null
  inferred: Record<string, unknown> | null
  confidence: Record<string, unknown> | null
  decay_policy: Record<string, unknown> | null
  updated_at: string
}

type DesignFeedbackRow = {
  id: string
  org_id: string
  project_id: string | null
  ops_run_id: string | null
  artifact_id: string | null
  variant_key: string
  feedback_type: AgentOpsDesignFeedback['feedbackType']
  status: AgentOpsDesignFeedback['status']
  feedback: string | null
  source: AgentOpsDesignFeedback['source']
  metadata: Record<string, unknown> | null
  created_by_user_id: string | null
  created_at: string
}

const PROFILE_SELECT = `
  id,
  org_id,
  user_id,
  project_id,
  profile_type,
  declared,
  inferred,
  confidence,
  decay_policy,
  updated_at
`

const FEEDBACK_SELECT = `
  id,
  org_id,
  project_id,
  ops_run_id,
  artifact_id,
  variant_key,
  feedback_type,
  status,
  feedback,
  source,
  metadata,
  created_by_user_id,
  created_at
`

export async function upsertAgentOpsOperatorProfile(
  input: AgentOpsOperatorProfile,
): Promise<AgentOpsOperatorProfile | null> {
  const parsed = operatorProfileSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_ops_operator_profiles')
    .upsert({
      org_id: parsed.orgId,
      user_id: parsed.userId ?? null,
      project_id: parsed.projectId ?? null,
      scope_key: buildOperatorProfileScopeKey(parsed),
      profile_type: parsed.profileType,
      declared: parsed.declared,
      inferred: parsed.inferred,
      confidence: parsed.confidence,
      decay_policy: parsed.decayPolicy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,scope_key,profile_type' })
    .select(PROFILE_SELECT)
    .single()

  if (error) {
    captureDesignOpsDbError(error, 'upsertAgentOpsOperatorProfile', {
      orgId: parsed.orgId,
      projectId: parsed.projectId ?? null,
      profileType: parsed.profileType,
    })
    return null
  }

  return mapProfileRow(data as OperatorProfileRow)
}

export async function listAgentOpsOperatorProfiles(input: {
  orgId: string
  projectId?: string | null
  userId?: string | null
  profileType?: AgentOpsOperatorProfileType | null
  limit?: number
}): Promise<AgentOpsOperatorProfile[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  let query = supabase
    .from('agent_ops_operator_profiles')
    .select(PROFILE_SELECT)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.userId) query = query.eq('user_id', input.userId)
  if (input.profileType) query = query.eq('profile_type', input.profileType)

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    captureDesignOpsDbError(error, 'listAgentOpsOperatorProfiles', {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
    })
    return []
  }

  return ((data ?? []) as OperatorProfileRow[]).map(mapProfileRow)
}

export async function recordAgentOpsDesignFeedback(
  input: AgentOpsDesignFeedback,
): Promise<AgentOpsDesignFeedback | null> {
  const parsed = designFeedbackSchema.parse(input)
  const fingerprint = buildDesignVariantFingerprint({
    orgId: parsed.orgId,
    projectId: parsed.projectId ?? null,
    runId: parsed.runId ?? null,
    variantKey: parsed.variantKey,
    feedbackType: parsed.feedbackType,
  })
  const { data, error } = await supabase
    .from('agent_ops_design_feedback')
    .upsert({
      org_id: parsed.orgId,
      project_id: parsed.projectId ?? null,
      ops_run_id: parsed.runId ?? null,
      artifact_id: parsed.artifactId ?? null,
      variant_key: parsed.variantKey,
      feedback_type: parsed.feedbackType,
      status: parsed.status,
      feedback: parsed.feedback ?? null,
      source: parsed.source,
      fingerprint,
      metadata: parsed.metadata,
      created_by_user_id: parsed.createdByUserId ?? null,
    }, { onConflict: 'org_id,fingerprint' })
    .select(FEEDBACK_SELECT)
    .single()

  if (error) {
    captureDesignOpsDbError(error, 'recordAgentOpsDesignFeedback', {
      orgId: parsed.orgId,
      projectId: parsed.projectId ?? null,
      runId: parsed.runId ?? null,
    })
    return null
  }

  return mapFeedbackRow(data as DesignFeedbackRow)
}

export async function listAgentOpsDesignFeedback(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  limit?: number
}): Promise<AgentOpsDesignFeedback[]> {
  const cappedLimit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  let query = supabase
    .from('agent_ops_design_feedback')
    .select(FEEDBACK_SELECT)
    .eq('org_id', input.orgId)

  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.runId) query = query.eq('ops_run_id', input.runId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(cappedLimit)

  if (error) {
    captureDesignOpsDbError(error, 'listAgentOpsDesignFeedback', {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      runId: input.runId ?? null,
    })
    return []
  }

  return ((data ?? []) as DesignFeedbackRow[]).map(mapFeedbackRow)
}

function mapProfileRow(row: OperatorProfileRow): AgentOpsOperatorProfile {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    projectId: row.project_id,
    profileType: row.profile_type,
    declared: row.declared ?? {},
    inferred: row.inferred ?? {},
    confidence: row.confidence ?? {},
    decayPolicy: row.decay_policy ?? {},
    updatedAt: row.updated_at,
  }
}

function buildOperatorProfileScopeKey(input: {
  userId?: string | null
  projectId?: string | null
}): string {
  return `user:${input.userId ?? 'any'}|project:${input.projectId ?? 'any'}`
}

function mapFeedbackRow(row: DesignFeedbackRow): AgentOpsDesignFeedback {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    runId: row.ops_run_id,
    artifactId: row.artifact_id,
    variantKey: row.variant_key,
    feedbackType: row.feedback_type,
    status: row.status,
    feedback: row.feedback,
    source: row.source,
    metadata: row.metadata ?? {},
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

function captureDesignOpsDbError(error: unknown, operation: string, context: Record<string, unknown>) {
  ErrorService.captureException(error, {
    severity: 'warning',
    context: { ...context, operation },
    tags: { layer: 'database', table: 'agent_ops_design_ops' },
  })
}
