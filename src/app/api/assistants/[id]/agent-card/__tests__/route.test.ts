import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockGetAgentCardState = vi.fn()
const mockPreviewAgentCardImport = vi.fn()
const mockApplyAgentCardImport = vi.fn()
const mockValidateAgentCardPayload = vi.fn()
const mockExportAgentCard = vi.fn()
const mockResolveAgentSharedContext = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({ getUserId: (...args: unknown[]) => mockGetUserId(...args) }))
vi.mock('@/lib/auth/csrf', () => ({ withCSRF: (handler: unknown) => handler }))
vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))
vi.mock('@/lib/agent-personalization/agent-card-service', () => ({
  getAgentCardState: (...args: unknown[]) => mockGetAgentCardState(...args),
  previewAgentCardImport: (...args: unknown[]) => mockPreviewAgentCardImport(...args),
  applyAgentCardImport: (...args: unknown[]) => mockApplyAgentCardImport(...args),
  validateAgentCardPayload: (...args: unknown[]) => mockValidateAgentCardPayload(...args),
  exportAgentCard: (...args: unknown[]) => mockExportAgentCard(...args),
}))
vi.mock('@/lib/db/shared-context', () => ({ resolveAgentSharedContext: (...args: unknown[]) => mockResolveAgentSharedContext(...args) }))
vi.mock('@/lib/lucid-cards/card-core', () => ({ normalizeAgentCard: (value: unknown) => value }))
vi.mock('@/lib/lucid-cards/card-resolution', () => ({ resolveLucidCards: () => ({ prompt_sections: ['## Context\nok'], prompt_budget: { chars: 12, cap: 32000 }, conflicts: [] }) }))

import { GET } from '../route'
import { GET as GET_EXPORT } from '../export/route'
import { POST as POST_IMPORT } from '../import/route'
import { POST as POST_PREVIEW } from '../preview/route'
import { POST as POST_VALIDATE } from '../validate/route'

const card = {
  schema_version: '1.0',
  kind: 'agent_card',
  metadata: { source: 'lucid' },
  profile: { name: 'Agent', bio: [], lore: [], adjectives: [], topics: [] },
}

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockGetAgentCardState.mockReset()
  mockPreviewAgentCardImport.mockReset()
  mockApplyAgentCardImport.mockReset()
  mockValidateAgentCardPayload.mockReset()
  mockExportAgentCard.mockReset()
  mockResolveAgentSharedContext.mockReset()

  mockGetUserId.mockResolvedValue('user-1')
  mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1', project_id: 'project-1' })
  mockIsUserOrgMember.mockResolvedValue(true)
  mockGetAgentCardState.mockResolvedValue({
    assistant: { id: 'assistant-1', org_id: 'org-1', project_id: 'project-1', name: 'Agent', description: null },
    card,
    documents: [],
    resolution: { prompt_budget: { chars: 0, cap: 32000 } },
  })
  mockPreviewAgentCardImport.mockResolvedValue({ card, can_apply: true })
  mockApplyAgentCardImport.mockResolvedValue({ card, can_apply: true, applied: true })
  mockValidateAgentCardPayload.mockResolvedValue({ status: 'pass', issues: [], metrics: { prompt_chars: 0 } })
  mockExportAgentCard.mockResolvedValue({ ...card, card_hash: 'abc12345' })
  mockResolveAgentSharedContext.mockResolvedValue({ records: [], scopes: [], policy_conflicts: [], policy_sources: [], prompt_sections: ['## Context\nok'] })
})

describe('assistant Agent Card API', () => {
  it('returns current native Agent Card state for authorized org members', async () => {
    const response = await GET(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card'), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(response.status).toBe(200)
    expect(mockGetAgentCardState).toHaveBeenCalledWith('assistant-1', 'user-1')
    await expect(response.json()).resolves.toMatchObject({ source: 'lucid', card, scope: { workspace_id: 'org-1', project_id: 'project-1' } })
  })

  it('keeps import preview non-mutating unless apply is true', async () => {
    const response = await POST_IMPORT(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card/import', { method: 'POST', body: JSON.stringify({ card, apply: false }) }), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(response.status).toBe(200)
    expect(mockPreviewAgentCardImport).toHaveBeenCalledWith({ assistantId: 'assistant-1', payload: card, userId: 'user-1', options: {} })
    expect(mockApplyAgentCardImport).not.toHaveBeenCalled()
  })

  it('uses the apply service only for explicit apply requests', async () => {
    const response = await POST_IMPORT(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card/import', { method: 'POST', body: JSON.stringify({ card, apply: true }) }), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(response.status).toBe(201)
    expect(mockApplyAgentCardImport).toHaveBeenCalledWith({ assistantId: 'assistant-1', payload: card, userId: 'user-1', options: {} })
  })

  it('validates, exports, and previews prompt sections', async () => {
    const validate = await POST_VALIDATE(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card/validate', { method: 'POST', body: JSON.stringify({ card }) }), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(validate.status).toBe(200)
    expect(mockValidateAgentCardPayload).toHaveBeenCalledWith({ assistantId: 'assistant-1', payload: card, userId: 'user-1' })

    const exported = await GET_EXPORT(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card/export'), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-disposition')).toContain('lucid-agent-card-assistant-1.json')

    const preview = await POST_PREVIEW(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card/preview', { method: 'POST', body: JSON.stringify({ card }) }), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(preview.status).toBe(200)
    await expect(preview.json()).resolves.toMatchObject({ prompt_sections: ['## Context\nok'] })
  })

  it('rejects unauthenticated and forbidden reads', async () => {
    mockGetUserId.mockResolvedValueOnce(null)
    const unauthenticated = await GET(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card'), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(unauthenticated.status).toBe(401)

    mockGetUserId.mockResolvedValueOnce('user-1')
    mockIsUserOrgMember.mockResolvedValueOnce(false)
    const forbidden = await GET(new NextRequest('http://localhost/api/assistants/assistant-1/agent-card'), { params: Promise.resolve({ id: 'assistant-1' }) })
    expect(forbidden.status).toBe(403)
  })
})
