import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET as GET_LIST } from '../route'
import { GET as GET_DETAIL } from '../[hostId]/route'

function request(url: string) {
  return new NextRequest(url)
}

describe('/api/agent-ops/external-host-packs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue('user-1')
    mocks.checkRateLimit.mockResolvedValue({ success: true })
  })

  it('requires authentication before listing packs', async () => {
    mocks.getUserId.mockResolvedValue(null)

    const response = await GET_LIST(request('http://localhost:3000/api/agent-ops/external-host-packs'))

    expect(response.status).toBe(401)
  })

  it('rate limits host pack listing', async () => {
    mocks.checkRateLimit.mockResolvedValue({ success: false })

    const response = await GET_LIST(request('http://localhost:3000/api/agent-ops/external-host-packs'))

    expect(response.status).toBe(429)
  })

  it('lists installable host packs from the shared registry', async () => {
    const response = await GET_LIST(request('http://localhost:3000/api/agent-ops/external-host-packs'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.manifest.sourceOfTruth).toBe('Lucid Cloud / Mission Control')
    expect(body.installerManifest).toEqual(expect.objectContaining({
      authority: 'lucid_cloud',
      baseUrl: 'http://localhost:3000',
      artifacts: expect.arrayContaining([
        expect.objectContaining({
          hostId: 'codex',
          rawUrl: 'http://localhost:3000/api/agent-ops/external-host-packs/codex?format=raw',
        }),
      ]),
    }))
    expect(body.packs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'codex',
        installTarget: '.agents/skills/lucid-agent-ops/SKILL.md',
      }),
      expect.objectContaining({
        id: 'openclaw',
        supportedEngines: ['openclaw'],
      }),
      expect.objectContaining({
        id: 'cursor',
        format: 'cursor_rule',
      }),
    ]))
  })

  it('returns JSON instructions for a specific host pack', async () => {
    const response = await GET_DETAIL(
      request('http://localhost:3000/api/agent-ops/external-host-packs/codex'),
      { params: Promise.resolve({ hostId: 'codex' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.pack.pack.id).toBe('codex')
    expect(body.instructions).toContain('Lucid Cloud remains the system of record')
    expect(body.instructions).toContain('Always produce these sections: Summary, Findings, Evidence, Risks, Next Actions')
  })

  it('returns raw install content for installer clients', async () => {
    const response = await GET_DETAIL(
      request('http://localhost:3000/api/agent-ops/external-host-packs/cursor?format=raw'),
      { params: Promise.resolve({ hostId: 'cursor' }) },
    )
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('x-lucid-agent-ops-host-pack')).toBe('cursor')
    expect(text).toMatch(/^---\ndescription: Lucid Agent Ops operating contract for Cursor/)
  })

  it('rejects unknown host packs without falling through to runtime code', async () => {
    const response = await GET_DETAIL(
      request('http://localhost:3000/api/agent-ops/external-host-packs/nope'),
      { params: Promise.resolve({ hostId: 'nope' }) },
    )

    expect(response.status).toBe(404)
  })
})
