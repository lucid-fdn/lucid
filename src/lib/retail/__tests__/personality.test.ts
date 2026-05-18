import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  getAssistantMock,
  findUserOrgMock,
  updateAssistantMock,
  AssistantOrgMismatchError,
} = vi.hoisted(() => {
  class AssistantOrgMismatchError extends Error {
    constructor(
      public readonly assistantId: string,
      public readonly expectedOrgId: string,
    ) {
      super(
        `updateAssistant: no row matched id=${assistantId} org_id=${expectedOrgId} — cross-org write prevented`,
      )
      this.name = 'AssistantOrgMismatchError'
    }
  }
  return {
    getAssistantMock: vi.fn(),
    findUserOrgMock: vi.fn(),
    updateAssistantMock: vi.fn(),
    AssistantOrgMismatchError,
  }
})

vi.mock('@/lib/db', () => ({
  getAssistant: getAssistantMock,
  getAssistants: vi.fn(),
  getRetailFleetAssistantsSummary: vi.fn(),
  findUserOrgByMetadataFlag: findUserOrgMock,
  updateAssistant: updateAssistantMock,
  AssistantOrgMismatchError,
}))

import { updateRetailAgentPersonality } from '../personality'
import { RETAIL_SOUL_MAX_LENGTH } from '../soul-presets'

const VALID_ID = '11111111-2222-3333-4444-555555555555'
const USER_ID = 'user-1'

function stubOwner() {
  getAssistantMock.mockResolvedValue({
    id: VALID_ID,
    org_id: 'org-retail-mine',
    name: 'My agent',
  })
  findUserOrgMock.mockResolvedValue('org-retail-mine')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateRetailAgentPersonality', () => {
  it('rejects a non-UUID assistant id via the ownership guard', async () => {
    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: '../../evil',
      presetId: 'friendly',
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_id' })
    expect(updateAssistantMock).not.toHaveBeenCalled()
  })

  it('404s (not_found) when the assistant belongs to a different org', async () => {
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-other',
      name: 'Someone else',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      presetId: 'friendly',
    })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
    expect(updateAssistantMock).not.toHaveBeenCalled()
  })

  it('404s (not_found) when the user has no retail org', async () => {
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-retail-mine',
      name: 'My agent',
    })
    findUserOrgMock.mockResolvedValue(null)

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      presetId: 'friendly',
    })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
    expect(updateAssistantMock).not.toHaveBeenCalled()
  })

  it('writes the preset content when given a known presetId', async () => {
    stubOwner()
    updateAssistantMock.mockResolvedValue({ org_id: 'org-retail-mine' })

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      presetId: 'friendly',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.assistantId).toBe(VALID_ID)
      expect(result.soulContent).toMatch(/warm, encouraging/i)
    }
    expect(updateAssistantMock).toHaveBeenCalledWith(
      VALID_ID,
      expect.objectContaining({
        soul_content: expect.stringMatching(/warm, encouraging/i),
      }),
      'org-retail-mine',
    )
  })

  it('returns invalid_preset for an unknown presetId', async () => {
    stubOwner()

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      presetId: 'does-not-exist',
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_preset' })
    expect(updateAssistantMock).not.toHaveBeenCalled()
  })

  it('writes free-text content after trimming whitespace', async () => {
    stubOwner()
    updateAssistantMock.mockResolvedValue({ org_id: 'org-retail-mine' })

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      content: '  You are a no-nonsense assistant.\n',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.soulContent).toBe('You are a no-nonsense assistant.')
    }
    expect(updateAssistantMock).toHaveBeenCalledWith(
      VALID_ID,
      { soul_content: 'You are a no-nonsense assistant.' },
      'org-retail-mine',
    )
  })

  it('clears the soul when free-text content is empty', async () => {
    // Empty content is a valid "remove my personality" — we store null so
    // the worker's soul injector skips the Agent Identity block entirely.
    stubOwner()
    updateAssistantMock.mockResolvedValue({ org_id: 'org-retail-mine' })

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      content: '   ',
    })

    expect(result.ok).toBe(true)
    expect(updateAssistantMock).toHaveBeenCalledWith(
      VALID_ID,
      { soul_content: null },
      'org-retail-mine',
    )
  })

  it('returns not_found when the scoped UPDATE matches 0 rows (TOCTOU)', async () => {
    // Assistant was reassigned to another org between ownership resolve
    // and the write — the scoped UPDATE (`eq('org_id', ownership.orgId)`)
    // matches 0 rows and throws AssistantOrgMismatchError. We must
    // collapse this to not_found without ever reporting success.
    stubOwner()
    updateAssistantMock.mockRejectedValue(
      new AssistantOrgMismatchError(VALID_ID, 'org-retail-mine'),
    )

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      presetId: 'friendly',
    })

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('rejects free-text content over the max length', async () => {
    stubOwner()

    const result = await updateRetailAgentPersonality({
      userId: USER_ID,
      assistantId: VALID_ID,
      content: 'x'.repeat(RETAIL_SOUL_MAX_LENGTH + 1),
    })

    expect(result).toEqual({ ok: false, reason: 'too_long' })
    expect(updateAssistantMock).not.toHaveBeenCalled()
  })
})
