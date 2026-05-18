import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const dbMocks = vi.hoisted(() => ({
  listBrowserOperatorAlerts: vi.fn(),
  listKnowledgeMaintenanceEvents: vi.fn(),
  listLucidPackManagedResources: vi.fn(),
  listSystemNotices: vi.fn(),
}))

const commerceMocks = vi.hoisted(() => ({
  listAgentCommerceEvents: vi.fn(),
}))

const agentOpsMocks = vi.hoisted(() => ({
  listAgentOpsRunsForOrg: vi.fn(),
}))

const claimMocks = vi.hoisted(() => ({
  listKnowledgeMetricClaims: vi.fn(),
}))

vi.mock('@/lib/db', () => dbMocks)
vi.mock('@/lib/db/agent-commerce', () => commerceMocks)
vi.mock('@/lib/db/agent-ops', () => agentOpsMocks)
vi.mock('@/lib/db/knowledge-claims', () => claimMocks)

import { buildLucidDoctorReport } from '../lucid-doctor'

describe('Lucid Doctor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    dbMocks.listKnowledgeMaintenanceEvents.mockResolvedValue([])
    dbMocks.listBrowserOperatorAlerts.mockResolvedValue([])
    dbMocks.listLucidPackManagedResources.mockResolvedValue([])
    dbMocks.listSystemNotices.mockResolvedValue([])
    commerceMocks.listAgentCommerceEvents.mockResolvedValue([])
    agentOpsMocks.listAgentOpsRunsForOrg.mockResolvedValue([])
    claimMocks.listKnowledgeMetricClaims.mockResolvedValue([])
  })

  it('summarizes cross-stack findings without creating a new source of truth', async () => {
    dbMocks.listKnowledgeMaintenanceEvents.mockResolvedValue([
      {
        id: uuid(1),
        orgId: uuid(10),
        projectId: null,
        severity: 'critical',
        title: 'Source refresh failed',
        summary: 'A source cannot refresh.',
        claimId: null,
        sourceId: uuid(20),
        pageId: null,
        entityId: null,
        evidence: [{ kind: 'url', url: 'https://example.com' }],
        eventType: 'source_refresh_failed',
      },
    ])
    dbMocks.listBrowserOperatorAlerts.mockResolvedValue([
      {
        id: uuid(2),
        org_id: uuid(10),
        severity: 'warning',
        title: 'Profile expired',
        message: 'Reconnect merchant profile.',
        status: 'open',
        browser_account_id: uuid(21),
        purchase_run_id: null,
        ops_run_id: null,
        metadata: { provider: 'playwright' },
        primary_cta: { label: 'Reconnect' },
        href: '/mission-control/browser',
        dedupe_key: 'browser:profile-expired',
      },
    ])
    claimMocks.listKnowledgeMetricClaims.mockResolvedValue([
      makeMetricClaim(uuid(30), 100, '2026-05-01T00:00:00.000Z'),
      makeMetricClaim(uuid(31), 70, '2026-05-02T00:00:00.000Z'),
    ])

    const report = await buildLucidDoctorReport({ orgId: uuid(10) })

    expect(report.status).toBe('blocked')
    expect(report.summary.critical).toBe(1)
    expect(report.findings.map((finding) => finding.domain)).toEqual(expect.arrayContaining(['knowledge', 'browser_operator']))
    expect(report.findings.some((finding) => finding.id.startsWith('knowledge_trajectory:'))).toBe(true)
  })

  it('keeps going when one diagnostic source fails', async () => {
    dbMocks.listBrowserOperatorAlerts.mockRejectedValue(new Error('browser source down'))

    const report = await buildLucidDoctorReport({ orgId: uuid(10), domains: ['browser_operator'] })

    expect(report.status).toBe('needs_attention')
    expect(report.findings[0]).toMatchObject({
      domain: 'env',
      title: 'Doctor source failed',
    })
  })
})

function makeMetricClaim(id: string, value: number, observedAt: string) {
  return {
    id,
    orgId: uuid(10),
    projectId: null,
    teamId: null,
    assistantId: null,
    sourceId: null,
    pageId: null,
    claimType: 'claim',
    subject: 'Acme Founder',
    claim: `MRR was ${value}.`,
    holderType: 'operator',
    holderId: null,
    confidence: 0.9,
    weight: 0.8,
    status: 'active',
    validFrom: null,
    validUntil: null,
    claimMetric: 'MRR',
    claimValue: value,
    claimUnit: 'usd',
    claimPeriod: 'month',
    observedAt,
    resolvedOutcome: null,
    resolvedAt: null,
    supersededBy: null,
    embeddingStatus: 'ready',
    embeddingModel: null,
    embeddingProviderId: null,
    semanticFingerprint: null,
    semanticClusterKey: null,
    evidence: [],
    metadata: {},
    createdAt: observedAt,
    updatedAt: observedAt,
  }
}

function uuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString().padStart(12, '0')}`
}
