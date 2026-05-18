import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockRequireUserId = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

import { GET } from '../route'

beforeEach(() => {
  mockRequireUserId.mockReset()
  mockFrom.mockReset()
})

describe('workspace search route', () => {
  it('searches org-scoped agents and apps using current schema columns', async () => {
    mockRequireUserId.mockResolvedValue('user-1')
    const calls: Array<{ table: string; select?: string; inArgs?: unknown[]; eqArgs: unknown[][] }> = []

    mockFrom.mockImplementation((table: string) => {
      const call = { table, select: undefined as string | undefined, inArgs: undefined as unknown[] | undefined, eqArgs: [] as unknown[][] }
      calls.push(call)

      if (table === 'organization_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ organization_id: 'org-1' }],
            error: null,
          }),
        }
      }

      const chain = {
        select: vi.fn((select: string) => {
          call.select = select
          return chain
        }),
        in: vi.fn((...args: unknown[]) => {
          call.inArgs = args
          return chain
        }),
        is: vi.fn(() => chain),
        or: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue({
          data: table === 'agents'
            ? [{ id: 'agent-1', org_id: 'org-1', project_id: 'project-1', name: 'Support Agent', description: 'Answers tickets', config: { icon_url: '/agent.svg' } }]
            : table === 'apps'
              ? [{ id: 'app-1', org_id: 'org-1', project_id: 'project-1', name: 'Support Portal', description: 'Customer app', config: { logoUrl: '/app.svg' } }]
              : [],
          error: null,
        }),
        eq: vi.fn((...args: unknown[]) => {
          call.eqArgs.push(args)
          return chain
        }),
      }

      if (table === 'favorites') {
        chain.limit = vi.fn().mockResolvedValue({ data: [], error: null })
      }

      return chain
    })

    const response = await GET(new NextRequest('http://localhost/api/workspace/search?q=support'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.results).toEqual([
      expect.objectContaining({ id: 'agent-1', type: 'AGENT', icon_url: '/agent.svg' }),
      expect.objectContaining({ id: 'app-1', type: 'APP', icon_url: '/app.svg' }),
    ])

    const agentCall = calls.find((call) => call.table === 'agents')
    const appCall = calls.find((call) => call.table === 'apps')
    expect(agentCall?.select).toContain('org_id')
    expect(agentCall?.select).not.toContain('user_id')
    expect(agentCall?.select).not.toContain('icon_url')
    expect(agentCall?.inArgs).toEqual(['org_id', ['org-1']])
    expect(appCall?.select).toContain('project_id')
    expect(appCall?.select).not.toContain('user_id')
    expect(appCall?.select).not.toContain('icon_url')
    expect(appCall?.inArgs).toEqual(['org_id', ['org-1']])
  })

  it('does not query org resources when the user has no memberships', async () => {
    mockRequireUserId.mockResolvedValue('user-1')
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organization_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const response = await GET(new NextRequest('http://localhost/api/workspace/search?q=support'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.results).toEqual([])
    expect(mockFrom).not.toHaveBeenCalledWith('agents')
    expect(mockFrom).not.toHaveBeenCalledWith('apps')
  })
})
