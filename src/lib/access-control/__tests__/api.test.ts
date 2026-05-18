import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAssistantPermission, requireOrgPermission } from '../api'

vi.mock('server-only', () => ({}))
vi.mock('../server', () => ({
  canPerformAction: vi.fn(),
}))
vi.mock('@/lib/request-context/org', () => ({
  requireOrgRequestContext: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  getAssistant: vi.fn(),
}))

import { requireOrgRequestContext } from '@/lib/request-context/org'
import { getAssistant } from '@/lib/db'

const mockRequireOrgRequestContext = vi.mocked(requireOrgRequestContext)
const mockGetAssistant = vi.mocked(getAssistant)

describe('access-control api helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grants org access when member and permission pass', async () => {
    mockRequireOrgRequestContext.mockResolvedValue({
      ok: true,
      context: { userId: 'user-1', orgId: 'org-1' },
    } as Awaited<ReturnType<typeof requireOrgRequestContext>>)

    const result = await requireOrgPermission('user-1', 'org-1', 'editProjects')

    expect(result).toEqual({ ok: true, orgId: 'org-1' })
    expect(mockRequireOrgRequestContext).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      permission: 'editProjects',
    })
  })

  it('denies org access when user is not a member', async () => {
    mockRequireOrgRequestContext.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as Awaited<ReturnType<typeof requireOrgRequestContext>>)

    const result = await requireOrgPermission('user-1', 'org-1', 'editProjects')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
    }
  })

  it('denies org access when permission check fails', async () => {
    mockRequireOrgRequestContext.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as Awaited<ReturnType<typeof requireOrgRequestContext>>)

    const result = await requireOrgPermission('user-1', 'org-1', 'manageSettings')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
    }
  })

  it('grants assistant access when assistant exists and permission passes', async () => {
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' } as NonNullable<Awaited<ReturnType<typeof getAssistant>>>)
    mockRequireOrgRequestContext.mockResolvedValue({
      ok: true,
      context: { userId: 'user-1', orgId: 'org-1' },
    } as Awaited<ReturnType<typeof requireOrgRequestContext>>)

    const result = await requireAssistantPermission('user-1', 'assistant-1', 'editProjects')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.orgId).toBe('org-1')
      expect(result.assistant.id).toBe('assistant-1')
    }
  })

  it('returns 404 when assistant is missing', async () => {
    mockGetAssistant.mockResolvedValue(null)

    const result = await requireAssistantPermission('user-1', 'assistant-404', 'editProjects')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(404)
    }
  })
})
