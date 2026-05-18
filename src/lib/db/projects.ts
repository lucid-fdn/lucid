import 'server-only'

import { supabase, ErrorService } from './client'

export interface ProjectRecord {
  id: string
  org_id: string
  name: string
  slug: string
  description: string | null
  is_default: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export interface ProjectResourceCounts {
  assistants: number
  crews: number
  workflows: number
  templates: number
}

export interface ProjectSummary extends ProjectRecord {
  counts: ProjectResourceCounts
}

export interface EnvironmentRecord {
  id: string
  project_id: string
  name: string
  is_default: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProjectRuntimePreference = 'shared' | 'managed' | 'byo' | 'auto'
export type ProjectApprovalPolicy = 'human_in_loop' | 'auto_low_risk' | 'strict'
export type ProjectMutationPolicy = 'review' | 'guided' | 'manual'
export type ProjectCreationMode = 'template_first' | 'describe_first' | 'blank_first'

export interface ProjectSettingsRecord {
  project_id: string
  org_id: string
  preferred_runtime: ProjectRuntimePreference
  approval_policy: ProjectApprovalPolicy
  mutation_policy: ProjectMutationPolicy
  default_creation_mode: ProjectCreationMode
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

const PROJECT_SELECT =
  'id, org_id, name, slug, description, is_default, created_at, updated_at, created_by, updated_by, deleted_at' as const

const ENVIRONMENT_SELECT =
  'id, project_id, name, is_default, created_at, updated_at, deleted_at' as const

const PROJECT_SETTINGS_SELECT =
  'project_id, org_id, preferred_runtime, approval_policy, mutation_policy, default_creation_mode, created_at, updated_at, created_by, updated_by' as const

function captureProjectError(error: unknown, context: Record<string, unknown>) {
  ErrorService.captureException(error as Error, {
    severity: 'error',
    context,
    tags: {
      layer: 'database',
      table: 'projects',
    },
  })
}

function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function slugifyProject(name: string): string {
  return normalizeProjectName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63) || 'project'
}

async function resolveUniqueProjectSlug(orgId: string, baseSlug: string): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('slug')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .like('slug', `${baseSlug}%`)

  if (error) throw error

  const existing = new Set((data ?? []).map((row) => row.slug as string))
  if (!existing.has(baseSlug)) return baseSlug

  for (let attempt = 2; attempt <= 50; attempt++) {
    const candidate = `${baseSlug}-${attempt}`
    if (!existing.has(candidate)) return candidate
  }

  throw new Error(`Could not resolve unique project slug for base ${baseSlug}`)
}

export async function getProjectsForWorkspace(orgId: string): Promise<ProjectRecord[]> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as ProjectRecord[]
  } catch (error) {
    captureProjectError(error, { operation: 'getProjectsForWorkspace', orgId })
    return []
  }
}

export async function getProjectAgentCountsForWorkspace(orgId: string): Promise<Map<string, number>> {
  try {
    const { data, error } = await supabase
      .from('ai_assistants')
      .select('project_id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not('project_id', 'is', null)

    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const projectId = (row as { project_id?: string | null }).project_id
      if (!projectId) continue
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1)
    }
    return counts
  } catch (error) {
    captureProjectError(error, { operation: 'getProjectAgentCountsForWorkspace', orgId })
    return new Map()
  }
}

export async function getDefaultProjectForWorkspace(orgId: string): Promise<ProjectRecord | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return (data as ProjectRecord | null) ?? null
  } catch (error) {
    captureProjectError(error, { operation: 'getDefaultProjectForWorkspace', orgId })
    return null
  }
}

// Backward-compatible alias used by older deploy/template paths.
export async function getPrimaryProjectForWorkspace(orgId: string): Promise<ProjectRecord | null> {
  return getDefaultProjectForWorkspace(orgId)
}

export async function getProjectBySlugForWorkspace(orgId: string, slug: string): Promise<ProjectRecord | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('org_id', orgId)
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return (data as ProjectRecord | null) ?? null
  } catch (error) {
    captureProjectError(error, { operation: 'getProjectBySlugForWorkspace', orgId, slug })
    return null
  }
}

export async function getProjectByIdForWorkspace(orgId: string, projectId: string): Promise<ProjectRecord | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('org_id', orgId)
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return (data as ProjectRecord | null) ?? null
  } catch (error) {
    captureProjectError(error, { operation: 'getProjectByIdForWorkspace', orgId, projectId })
    return null
  }
}

export async function getDefaultEnvironmentForProject(projectId: string): Promise<EnvironmentRecord | null> {
  try {
    const { data, error } = await supabase
      .from('environments')
      .select(ENVIRONMENT_SELECT)
      .eq('project_id', projectId)
      .eq('is_default', true)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    return (data as EnvironmentRecord | null) ?? null
  } catch (error) {
    captureProjectError(error, { operation: 'getDefaultEnvironmentForProject', projectId })
    return null
  }
}

export async function ensureDefaultEnvironmentForProject(
  projectId: string,
  userId?: string | null,
): Promise<EnvironmentRecord | null> {
  const existing = await getDefaultEnvironmentForProject(projectId)
  if (existing) return existing

  try {
    const { data, error } = await supabase
      .from('environments')
      .insert({
        project_id: projectId,
        name: 'production',
        is_default: true,
        created_by: userId ?? null,
        updated_by: userId ?? null,
      })
      .select(ENVIRONMENT_SELECT)
      .single()

    if (error) throw error
    return (data as EnvironmentRecord | null) ?? null
  } catch (error) {
    captureProjectError(error, { operation: 'ensureDefaultEnvironmentForProject', projectId })
    return null
  }
}

export async function getProjectSettings(orgId: string, projectId: string): Promise<ProjectSettingsRecord | null> {
  try {
    const { data, error } = await supabase
      .from('project_settings')
      .select(PROJECT_SETTINGS_SELECT)
      .eq('org_id', orgId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) throw error
    return (data as ProjectSettingsRecord | null) ?? null
  } catch (error) {
    captureProjectError(error, { operation: 'getProjectSettings', orgId, projectId })
    return null
  }
}

export async function createProject(params: {
  orgId: string
  name: string
  description?: string | null
  createdBy?: string | null
}): Promise<ProjectRecord | null> {
  try {
    const name = normalizeProjectName(params.name)
    const slug = await resolveUniqueProjectSlug(params.orgId, slugifyProject(name))

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        org_id: params.orgId,
        name,
        slug,
        description: params.description ?? null,
        is_default: false,
        created_by: params.createdBy ?? null,
        updated_by: params.createdBy ?? null,
      })
      .select(PROJECT_SELECT)
      .single()

    if (projectError || !project) throw projectError ?? new Error('Project creation returned no row')

    const { error: envError } = await supabase
      .from('environments')
      .insert({
        project_id: project.id,
        name: 'production',
        is_default: true,
        created_by: params.createdBy ?? null,
        updated_by: params.createdBy ?? null,
      })

    if (envError) {
      await supabase.from('projects').delete().eq('id', project.id)
      throw envError
    }

    return project as ProjectRecord
  } catch (error) {
    captureProjectError(error, { operation: 'createProject', orgId: params.orgId })
    return null
  }
}

export async function updateProject(
  orgId: string,
  projectId: string,
  updates: {
    name?: string
    description?: string | null
    updatedBy?: string | null
  },
): Promise<ProjectRecord | null> {
  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: updates.updatedBy ?? null,
    }

    if (typeof updates.name === 'string') {
      payload.name = normalizeProjectName(updates.name)
    }

    if ('description' in updates) {
      payload.description = updates.description ?? null
    }

    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('org_id', orgId)
      .eq('id', projectId)
      .is('deleted_at', null)
      .select(PROJECT_SELECT)
      .single()

    if (error) throw error
    return data as ProjectRecord
  } catch (error) {
    captureProjectError(error, { operation: 'updateProject', orgId, projectId })
    return null
  }
}

export async function upsertProjectSettings(
  orgId: string,
  projectId: string,
  settings: {
    preferredRuntime?: ProjectRuntimePreference
    approvalPolicy?: ProjectApprovalPolicy
    mutationPolicy?: ProjectMutationPolicy
    defaultCreationMode?: ProjectCreationMode
    updatedBy?: string | null
  },
): Promise<ProjectSettingsRecord | null> {
  try {
    const payload: Record<string, unknown> = {
      org_id: orgId,
      project_id: projectId,
      updated_at: new Date().toISOString(),
      updated_by: settings.updatedBy ?? null,
    }

    if (settings.preferredRuntime) payload.preferred_runtime = settings.preferredRuntime
    if (settings.approvalPolicy) payload.approval_policy = settings.approvalPolicy
    if (settings.mutationPolicy) payload.mutation_policy = settings.mutationPolicy
    if (settings.defaultCreationMode) payload.default_creation_mode = settings.defaultCreationMode

    if (settings.updatedBy !== undefined) {
      payload.created_by = settings.updatedBy ?? null
    }

    const { data, error } = await supabase
      .from('project_settings')
      .upsert(payload, { onConflict: 'project_id' })
      .select(PROJECT_SETTINGS_SELECT)
      .single()

    if (error) throw error
    return data as ProjectSettingsRecord
  } catch (error) {
    captureProjectError(error, { operation: 'upsertProjectSettings', orgId, projectId })
    return null
  }
}

export async function archiveProject(orgId: string, projectId: string, updatedBy?: string | null): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('projects')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      })
      .eq('org_id', orgId)
      .eq('id', projectId)
      .eq('is_default', false)
      .is('deleted_at', null)

    if (error) throw error
    return true
  } catch (error) {
    captureProjectError(error, { operation: 'archiveProject', orgId, projectId })
    return false
  }
}

export async function getProjectResourceCounts(
  orgId: string,
  projectId: string,
): Promise<ProjectResourceCounts> {
  const emptyCounts: ProjectResourceCounts = {
    assistants: 0,
    crews: 0,
    workflows: 0,
    templates: 0,
  }

  try {
    const [
      assistantsResult,
      crewsResult,
      workflowsResult,
      templatesResult,
    ] = await Promise.all([
      supabase
        .from('ai_assistants')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('project_id', projectId),
      supabase
        .from('crews')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('project_id', projectId)
        .is('deleted_at', null),
      supabase
        .from('workflows')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('project_id', projectId),
      supabase
        .from('lucid_pack_installs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('project_id', projectId),
    ])

    return {
      assistants: assistantsResult.count ?? 0,
      crews: crewsResult.count ?? 0,
      workflows: workflowsResult.count ?? 0,
      templates: templatesResult.count ?? 0,
    }
  } catch (error) {
    captureProjectError(error, { operation: 'getProjectResourceCounts', orgId, projectId })
    return emptyCounts
  }
}

export async function getProjectSummariesForWorkspace(orgId: string): Promise<ProjectSummary[]> {
  const projects = await getProjectsForWorkspace(orgId)
  const counts = await Promise.all(
    projects.map(async (project) => [project.id, await getProjectResourceCounts(orgId, project.id)] as const),
  )
  const countsMap = new Map(counts)

  return projects.map((project) => ({
    ...project,
    counts: countsMap.get(project.id) ?? {
      assistants: 0,
      crews: 0,
      workflows: 0,
      templates: 0,
    },
  }))
}
