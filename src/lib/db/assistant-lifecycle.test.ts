import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFrom,
  mockRevokeRuntime,
  mockDestroyRuntimeViaL2,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRevokeRuntime: vi.fn(),
  mockDestroyRuntimeViaL2: vi.fn(),
  mockCaptureException: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('./client', () => ({
  supabase: {
    from: mockFrom,
  },
}))

vi.mock('./mission-control', () => ({
  revokeRuntime: mockRevokeRuntime,
}))

vi.mock('@/app/api/runtimes/_deploy', () => ({
  destroyRuntimeViaL2: mockDestroyRuntimeViaL2,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: mockCaptureException,
  },
}))

import { prepareAssistantDeletion } from './assistant-lifecycle'

function makeQueryResult(result: { data?: unknown; error?: unknown; count?: number }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null })),
  }

  return query
}

describe('prepareAssistantDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continues deleting when provider teardown fails after runtime revocation', async () => {
    const runtimeCountQuery = makeQueryResult({ count: 1 })
    const runtimeQuery = makeQueryResult({
      data: { l2_deployment_id: 'dep-1', l2_passport_id: 'pass-1' },
    })

    const approvalsQuery = makeQueryResult({})

    mockFrom
      .mockReturnValueOnce(runtimeCountQuery)
      .mockReturnValueOnce(runtimeQuery)
      .mockReturnValueOnce(approvalsQuery)

    mockRevokeRuntime.mockResolvedValue({ success: true })
    mockDestroyRuntimeViaL2.mockResolvedValue(false)

    await expect(
      prepareAssistantDeletion({
        assistantId: 'asst-1',
        orgId: 'org-1',
        runtimeId: 'rt-1',
      }),
    ).resolves.toBeUndefined()

    expect(mockRevokeRuntime).toHaveBeenCalledWith('rt-1', 'org-1')
    expect(mockDestroyRuntimeViaL2).toHaveBeenCalledWith('dep-1', 'rt-1', 'pass-1')
    expect(mockCaptureException).toHaveBeenCalled()
  })

  it('skips runtime teardown when the assistant is not the sole runtime occupant', async () => {
    const runtimeCountQuery = makeQueryResult({ count: 2 })
    const approvalsQuery = makeQueryResult({})

    mockFrom
      .mockReturnValueOnce(runtimeCountQuery)
      .mockReturnValueOnce(approvalsQuery)

    await expect(
      prepareAssistantDeletion({
        assistantId: 'asst-1',
        orgId: 'org-1',
        runtimeId: 'rt-1',
      }),
    ).resolves.toBeUndefined()

    expect(mockRevokeRuntime).not.toHaveBeenCalled()
    expect(mockDestroyRuntimeViaL2).not.toHaveBeenCalled()
  })
})
