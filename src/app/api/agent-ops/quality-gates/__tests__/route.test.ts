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

import { GET } from '../route'

function request(url = 'http://localhost:3000/api/agent-ops/quality-gates') {
  return new NextRequest(url)
}

describe('GET /api/agent-ops/quality-gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue('user-1')
    mocks.checkRateLimit.mockResolvedValue({ success: true })
  })

  it('requires authentication', async () => {
    mocks.getUserId.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it('rate limits quality gate report reads', async () => {
    mocks.checkRateLimit.mockResolvedValue({ success: false })

    const response = await GET(request())

    expect(response.status).toBe(429)
  })

  it('returns the default JSON report for Mission Control/API consumers', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.report).toMatchObject({
      schemaVersion: 1,
      target: 'local',
      summary: {
        total: expect.any(Number),
        required: expect.any(Number),
        live: 0,
        destructive: 0,
      },
    })
    expect(body.report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'diff-hygiene', phase: 'source_hygiene' }),
      expect.objectContaining({ id: 'host-pack-matrix-dry-run', phase: 'generated_contracts' }),
    ]))
  })

  it('supports read-only live and workerless report options', async () => {
    const response = await GET(request('http://localhost:3000/api/agent-ops/quality-gates?target=staging&live=true&worker=false'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.report.target).toBe('staging')
    expect(body.report.liveGateIds).toBeUndefined()
    expect(body.report.summary.live).toBe(3)
    expect(body.report.gates.map((gate: { id: string }) => gate.id)).toEqual(expect.arrayContaining([
      'supabase-migration-list',
      'supabase-db-lint',
      'agent-ops-prod-schema-smoke',
    ]))
    expect(body.report.gates.map((gate: { id: string }) => gate.id)).not.toContain('worker-build')
  })

  it('returns markdown for docs and GitHub summary consumers', async () => {
    const response = await GET(request('http://localhost:3000/api/agent-ops/quality-gates?format=markdown&worker=false'))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(response.headers.get('x-lucid-agent-ops-quality-gates')).toBe('local')
    expect(text).toContain('# Agent Ops Quality Gate Pack')
    expect(text).toContain('| Total gates | Required | Live | Destructive |')
  })

  it('rejects invalid targets without invoking runtime behavior', async () => {
    const response = await GET(request('http://localhost:3000/api/agent-ops/quality-gates?target=prod'))

    expect(response.status).toBe(400)
  })
})
