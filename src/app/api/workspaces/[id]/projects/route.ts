import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole, isUserOrgMember } from '@/lib/db'
import {
  createProject,
  getProjectSummariesForWorkspace,
} from '@/lib/db/projects'

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
})

function canManageProjects(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'developer'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orgId } = await params
  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const projects = await getProjectSummariesForWorkspace(orgId)
  return NextResponse.json({ projects })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orgId } = await params
  const role = await getOrgMemberRole(userId, orgId)
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const project = await createProject({
    orgId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    createdBy: userId,
  })

  if (!project) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }

  return NextResponse.json({ project }, { status: 201 })
}
