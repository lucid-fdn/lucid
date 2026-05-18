import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockGetProjectByIdForWorkspace = vi.fn()
const mockCreateSharedContextRecord = vi.fn()
const mockListSharedContextRecords = vi.fn()
const mockResolveSharedContext = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({ getUserId: (...args: unknown[]) => mockGetUserId(...args) }))
vi.mock('@/lib/auth/csrf', () => ({ withCSRF: (handler: unknown) => handler }))
vi.mock('@/lib/db', () => ({ isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args) }))
vi.mock('@/lib/db/projects', () => ({ getProjectByIdForWorkspace: (...args: unknown[]) => mockGetProjectByIdForWorkspace(...args) }))
vi.mock('@/lib/db/shared-context', () => ({
  createSharedContextRecord: (...args: unknown[]) => mockCreateSharedContextRecord(...args),
  listSharedContextRecords: (...args: unknown[]) => mockListSharedContextRecords(...args),
  resolveSharedContext: (...args: unknown[]) => mockResolveSharedContext(...args),
}))

import { POST as POST_WORKSPACE_CONTEXT } from '../route'
import { POST as POST_PROJECT_CONTEXT } from '../../projects/[projectId]/context/route'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockIsUserOrgMember.mockReset()
  mockGetProjectByIdForWorkspace.mockReset()
  mockCreateSharedContextRecord.mockReset()
  mockListSharedContextRecords.mockReset()
  mockResolveSharedContext.mockReset()

  mockGetUserId.mockResolvedValue(userId)
  mockIsUserOrgMember.mockResolvedValue(true)
  mockGetProjectByIdForWorkspace.mockResolvedValue({ id: projectId, org_id: workspaceId })
  mockCreateSharedContextRecord.mockResolvedValue({ id: 'record-1' })
})

describe('Agent Card shared context saves', () => {
  it('saves Organization Card policy through the workspace context route', async () => {
    const response = await POST_WORKSPACE_CONTEXT(new NextRequest(`http://localhost/api/workspaces/${workspaceId}/context`, {
      method: 'POST',
      body: JSON.stringify({
        scope_type: 'workspace',
        scope_id: workspaceId,
        record_type: 'policy',
        title: 'Organization Card voice and policy',
        body: 'Voice: crisp',
        source_type: 'lucid_card_editor',
        confidence: 0.9,
        status: 'active',
        metadata: {
          lucid_card_scope: 'organization',
          brand_voice: ['crisp'],
          default_style: ['short'],
          banned_phrases: ['maybe'],
          policy: { approvals: true },
        },
        links: [],
      }),
    }), { params: Promise.resolve({ id: workspaceId }) })

    expect(response.status).toBe(201)
    expect(mockCreateSharedContextRecord).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
      scope_type: 'workspace',
      scope_id: workspaceId,
      record_type: 'policy',
      source_type: 'lucid_card_editor',
      metadata: expect.objectContaining({
        lucid_card_scope: 'organization',
        policy: { approvals: true },
      }),
    }), userId)
  })

  it('saves Project Card policy through the project context route with project scoping', async () => {
    const response = await POST_PROJECT_CONTEXT(new NextRequest(`http://localhost/api/workspaces/${workspaceId}/projects/${projectId}/context`, {
      method: 'POST',
      body: JSON.stringify({
        scope_type: 'project',
        scope_id: projectId,
        record_type: 'policy',
        title: 'Project Card style and policy',
        body: 'Style: concrete',
        source_type: 'lucid_card_editor',
        confidence: 0.9,
        status: 'active',
        metadata: {
          lucid_card_scope: 'project',
          style: ['concrete'],
          banned_phrases: ['later'],
          policy: { budget: 'strict' },
        },
        links: [],
      }),
    }), { params: Promise.resolve({ id: workspaceId, projectId }) })

    expect(response.status).toBe(201)
    expect(mockGetProjectByIdForWorkspace).toHaveBeenCalledWith(workspaceId, projectId)
    expect(mockCreateSharedContextRecord).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
      project_id: projectId,
      scope_type: 'project',
      scope_id: projectId,
      record_type: 'policy',
      metadata: expect.objectContaining({
        lucid_card_scope: 'project',
        policy: { budget: 'strict' },
      }),
    }), userId)
  })

  it('keeps unauthorized and forbidden context writes closed', async () => {
    mockGetUserId.mockResolvedValueOnce(null)
    const unauthorized = await POST_WORKSPACE_CONTEXT(new NextRequest(`http://localhost/api/workspaces/${workspaceId}/context`, {
      method: 'POST',
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: workspaceId }) })
    expect(unauthorized.status).toBe(401)

    mockGetUserId.mockResolvedValueOnce(userId)
    mockIsUserOrgMember.mockResolvedValueOnce(false)
    const forbidden = await POST_PROJECT_CONTEXT(new NextRequest(`http://localhost/api/workspaces/${workspaceId}/projects/${projectId}/context`, {
      method: 'POST',
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: workspaceId, projectId }) })
    expect(forbidden.status).toBe(403)
  })
})
