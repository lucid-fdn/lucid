import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole, isUserOrgMember } from '@/lib/db'
import {
  archiveProject,
  getProjectByIdForWorkspace,
  type ProjectApprovalPolicy,
  type ProjectCreationMode,
  type ProjectMutationPolicy,
  type ProjectRuntimePreference,
  upsertProjectSettings,
  updateProject,
} from '@/lib/db/projects'

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  archive: z.boolean().optional(),
  settings: z.object({
    preferredRuntime: z.enum(['shared', 'managed', 'byo', 'auto']).optional(),
    approvalPolicy: z.enum(['human_in_loop', 'auto_low_risk', 'strict']).optional(),
    mutationPolicy: z.enum(['review', 'guided', 'manual']).optional(),
    defaultCreationMode: z.enum(['template_first', 'describe_first', 'blank_first']).optional(),
  }).optional(),
})

function canEditProjects(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'developer'
}

function canArchiveProjects(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orgId, projectId } = await params
  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const project = await getProjectByIdForWorkspace(orgId, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json({ project })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orgId, projectId } = await params
  const role = await getOrgMemberRole(userId, orgId)
  if (!canEditProjects(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  if (parsed.data.archive) {
    if (!canArchiveProjects(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const archived = await archiveProject(orgId, projectId, userId)
    if (!archived) {
      return NextResponse.json({ error: 'Failed to archive project' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  const hasProjectMetadataChanges = parsed.data.name !== undefined || 'description' in parsed.data
  const hasSettingsChanges =
    parsed.data.settings !== undefined &&
    Object.values(parsed.data.settings).some((value) => value !== undefined)

  const project = hasProjectMetadataChanges
    ? await updateProject(orgId, projectId, {
        name: parsed.data.name,
        description: parsed.data.description,
        updatedBy: userId,
      })
    : await getProjectByIdForWorkspace(orgId, projectId)

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  let projectSettings = null
  if (hasSettingsChanges && parsed.data.settings) {
    projectSettings = await upsertProjectSettings(orgId, projectId, {
      preferredRuntime: parsed.data.settings.preferredRuntime as ProjectRuntimePreference | undefined,
      approvalPolicy: parsed.data.settings.approvalPolicy as ProjectApprovalPolicy | undefined,
      mutationPolicy: parsed.data.settings.mutationPolicy as ProjectMutationPolicy | undefined,
      defaultCreationMode: parsed.data.settings.defaultCreationMode as ProjectCreationMode | undefined,
      updatedBy: userId,
    })
  }

  return NextResponse.json({ project, projectSettings })
}
