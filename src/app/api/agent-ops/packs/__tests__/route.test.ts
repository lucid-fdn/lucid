import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  getOrgMemberRole: vi.fn(),
  isUserOrgMember: vi.fn(),
  createLucidPack: vi.fn(),
  getLucidPack: vi.fn(),
  listLucidPacks: vi.fn(),
  installLucidPack: vi.fn(),
  forkLucidPackManagedResource: vi.fn(),
  listLucidPackInstalls: vi.fn(),
  listLucidPackManagedResources: vi.fn(),
  listLucidPackMarketplaceSubmissions: vi.fn(),
  getLucidPackInstall: vi.fn(),
  reconcileLucidPackInstall: vi.fn(),
  submitLucidPackForMarketplaceReview: vi.fn(),
  updateLucidPackInstallStatus: vi.fn(),
  installTemplatePack: vi.fn(),
  provisionTemplatePackInstall: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
    STANDARD: { name: 'standard' },
  },
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/db', () => ({
  createLucidPack: mocks.createLucidPack,
  forkLucidPackManagedResource: mocks.forkLucidPackManagedResource,
  getLucidPack: mocks.getLucidPack,
  getLucidPackInstall: mocks.getLucidPackInstall,
  getOrgMemberRole: mocks.getOrgMemberRole,
  installLucidPack: mocks.installLucidPack,
  isUserOrgMember: mocks.isUserOrgMember,
  listLucidPackInstalls: mocks.listLucidPackInstalls,
  listLucidPackManagedResources: mocks.listLucidPackManagedResources,
  listLucidPackMarketplaceSubmissions: mocks.listLucidPackMarketplaceSubmissions,
  listLucidPacks: mocks.listLucidPacks,
  reconcileLucidPackInstall: mocks.reconcileLucidPackInstall,
  submitLucidPackForMarketplaceReview: mocks.submitLucidPackForMarketplaceReview,
  updateLucidPackInstallStatus: mocks.updateLucidPackInstallStatus,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/templates/install', () => ({
  installTemplatePack: mocks.installTemplatePack,
}))

vi.mock('@/lib/templates/capabilities/provisioners', () => ({
  provisionTemplatePackInstall: mocks.provisionTemplatePackInstall,
}))

import { GET, POST } from '../route'
import { POST as POST_PREVIEW } from '../[id]/preview/route'
import { GET as GET_INSTALLS, POST as POST_INSTALL } from '../install/route'
import { PATCH as PATCH_INSTALL } from '../install/[installId]/route'
import { GET as GET_MARKETPLACE_SUBMISSIONS, POST as POST_MARKETPLACE_SUBMISSION } from '@/app/api/templates/marketplace-submissions/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const packId = '44444444-4444-4444-8444-444444444444'
const installId = '55555555-5555-4555-8555-555555555555'

const manifest = {
  schemaVersion: '2026-05-07.lucid-pack.v1',
  key: 'launch-readiness',
  name: 'Launch Readiness',
  description: 'Launch readiness pack.',
  version: '1.0.0',
  resources: [{
    key: 'workflow:check-page',
    kind: 'workflow',
    name: 'Check page',
    policy: 'managed',
    spec: { workflow_id: 'check-page', token: 'secret://browser-operator' },
  }],
  metadata: {},
}

function request(url: string, method = 'GET', body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  })
}

describe('/api/agent-ops/packs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.getOrgMemberRole.mockResolvedValue('admin')
    mocks.listLucidPacks.mockResolvedValue([{ id: packId, packKey: 'launch-readiness', name: 'Launch Readiness', description: 'Launch readiness pack.', version: '1.0.0', status: 'active', manifest }])
    mocks.createLucidPack.mockResolvedValue({ id: packId, packKey: 'launch-readiness', name: 'Launch Readiness', description: 'Launch readiness pack.', version: '1.0.0', status: 'active', manifest })
    mocks.getLucidPack.mockResolvedValue({ id: packId, orgId: null, packKey: 'launch-readiness', name: 'Launch Readiness', description: 'Launch readiness pack.', version: '1.0.0', status: 'active', manifest, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    mocks.installLucidPack.mockResolvedValue({ id: installId, orgId, packId, projectId: null, status: 'active', config: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    mocks.forkLucidPackManagedResource.mockResolvedValue({ id: 'resource-1', installId, resourceKey: 'workflow:check-page', resourceKind: 'workflow', managementPolicy: 'managed', status: 'forked', metadata: {}, specHash: 'abc123' })
    mocks.listLucidPackInstalls.mockResolvedValue([{ id: installId, orgId, packId, projectId: null, status: 'active', config: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
    mocks.listLucidPackManagedResources.mockResolvedValue([{ id: 'resource-1', installId, resourceKey: 'workflow:check-page', resourceKind: 'workflow', managementPolicy: 'managed', status: 'active', metadata: {}, specHash: 'abc123' }])
    mocks.listLucidPackMarketplaceSubmissions.mockResolvedValue([{ id: '66666666-6666-4666-8666-666666666666', orgId, packId, status: 'submitted', qualityReport: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
    mocks.submitLucidPackForMarketplaceReview.mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666', orgId, packId, status: 'submitted', qualityReport: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    mocks.getLucidPackInstall.mockResolvedValue({ id: installId, orgId, packId, projectId: null, status: 'active', config: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    mocks.reconcileLucidPackInstall.mockResolvedValue({
      install: { id: installId },
      resources: [],
      diffs: [{ resourceKey: 'workflow:check-page', action: 'noop', reason: 'Resource already matches the pack manifest.' }],
      summary: { created: 0, unchanged: 1, updated: 0, drifted: 0, forked: 0, archived: 0 },
    })
    mocks.updateLucidPackInstallStatus.mockResolvedValue({ id: installId, orgId, packId, projectId: null, status: 'archived', config: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    const provisioning = {
      install: { id: installId },
      pack: { id: packId },
      results: [],
      summary: { provisioned: 0, registered: 0, needsSetup: 0, skipped: 0, failed: 0 },
    }
    mocks.installTemplatePack.mockResolvedValue({
      install: { id: installId, orgId, packId, projectId: null, status: 'active', config: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      resources: [{ id: 'resource-1', installId, resourceKey: 'workflow:check-page', resourceKind: 'workflow', managementPolicy: 'managed', status: 'active', metadata: {}, specHash: 'abc123' }],
      provisioning,
    })
    mocks.provisionTemplatePackInstall.mockResolvedValue(provisioning)
  })

  it('lists org-visible packs and install resources', async () => {
    const packsResponse = await GET(request(`http://localhost:3000/api/agent-ops/packs?org_id=${orgId}`))
    const packsBody = await packsResponse.json()
    const installsResponse = await GET_INSTALLS(request(`http://localhost:3000/api/agent-ops/packs/install?org_id=${orgId}&include_resources=true`))
    const installsBody = await installsResponse.json()

    expect(packsResponse.status).toBe(200)
    expect(packsBody.packs[0].name).toBe('Launch Readiness')
    expect(installsResponse.status).toBe(200)
    expect(installsBody.resources[0].resourceKey).toBe('workflow:check-page')
  })

  it('rejects embedded secrets when creating a pack', async () => {
    const response = await POST(request('http://localhost:3000/api/agent-ops/packs', 'POST', {
      org_id: orgId,
      manifest: {
        ...manifest,
        resources: [{ ...manifest.resources[0], spec: { api_key: 'sk-proj-this_should_not_be_embedded_abcdefghijklmnopqrstuvwxyz' } }],
      },
    }))

    expect(response.status).toBe(400)
    expect(mocks.createLucidPack).not.toHaveBeenCalled()
  })

  it('requires admin or owner role to install and reconcile packs', async () => {
    const installResponse = await POST_INSTALL(request('http://localhost:3000/api/agent-ops/packs/install', 'POST', {
      org_id: orgId,
      pack_id: packId,
    }))
    const reconcileResponse = await PATCH_INSTALL(
      request(`http://localhost:3000/api/agent-ops/packs/install/${installId}`, 'PATCH', {
        org_id: orgId,
        action: 'reconcile',
      }),
      { params: Promise.resolve({ installId }) },
    )

    expect(installResponse.status).toBe(201)
    expect(reconcileResponse.status).toBe(200)
    expect(mocks.installTemplatePack).toHaveBeenCalledWith({ orgId, projectId: null, packId, config: {}, userId })
    expect(mocks.provisionTemplatePackInstall).toHaveBeenCalledWith({ orgId, installId, userId })
    expect(mocks.reconcileLucidPackInstall).toHaveBeenCalledWith({ orgId, installId })
  })

  it('supports archive-safe uninstall without deleting managed resource history', async () => {
    const response = await PATCH_INSTALL(
      request(`http://localhost:3000/api/agent-ops/packs/install/${installId}`, 'PATCH', {
        org_id: orgId,
        action: 'uninstall',
      }),
      { params: Promise.resolve({ installId }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.updateLucidPackInstallStatus).toHaveBeenCalledWith({
      orgId,
      installId,
      status: 'archived',
    })
    expect(mocks.listLucidPackManagedResources).toHaveBeenCalledWith({
      orgId,
      installId,
      limit: 500,
    })
  })

  it('supports operator fork of a managed resource before local edits', async () => {
    const response = await PATCH_INSTALL(
      request(`http://localhost:3000/api/agent-ops/packs/install/${installId}`, 'PATCH', {
        org_id: orgId,
        action: 'fork_resource',
        resource_key: 'workflow:check-page',
        reason: 'Local project variant.',
      }),
      { params: Promise.resolve({ installId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.resource.status).toBe('forked')
    expect(mocks.forkLucidPackManagedResource).toHaveBeenCalledWith({
      orgId,
      installId,
      resourceKey: 'workflow:check-page',
      reason: 'Local project variant.',
    })
  })

  it('previews a capability template through the pack lifecycle', async () => {
    mocks.listLucidPackManagedResources.mockResolvedValueOnce([])
    const response = await POST_PREVIEW(
      request(`http://localhost:3000/api/agent-ops/packs/${packId}/preview`, 'POST', {
        org_id: orgId,
      }),
      { params: Promise.resolve({ id: packId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.preview.templateKey).toBe('launch-readiness')
    expect(body.preview.summary.creates).toBe(1)
    expect(mocks.getLucidPack).toHaveBeenCalledWith({ orgId, packId })
  })

  it('submits workspace packs for marketplace review with quality evidence', async () => {
    const listResponse = await GET_MARKETPLACE_SUBMISSIONS(
      request(`http://localhost:3000/api/templates/marketplace-submissions?org_id=${orgId}&pack_id=${packId}`),
    )
    const submitResponse = await POST_MARKETPLACE_SUBMISSION(
      request('http://localhost:3000/api/templates/marketplace-submissions', 'POST', {
        org_id: orgId,
        pack_id: packId,
        quality_report: { validation: 'passed' },
        review_notes: 'Ready for review.',
      }),
    )
    const submitBody = await submitResponse.json()

    expect(listResponse.status).toBe(200)
    expect(submitResponse.status).toBe(201)
    expect(submitBody.submission.status).toBe('submitted')
    expect(mocks.submitLucidPackForMarketplaceReview).toHaveBeenCalledWith({
      orgId,
      packId,
      submittedByUserId: userId,
      qualityReport: { validation: 'passed' },
      reviewNotes: 'Ready for review.',
    })
  })
})
