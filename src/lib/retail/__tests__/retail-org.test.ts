import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { findUserOrgByMetadataFlagMock, createOrganizationMock } = vi.hoisted(() => ({
  findUserOrgByMetadataFlagMock: vi.fn(),
  createOrganizationMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  findUserOrgByMetadataFlag: findUserOrgByMetadataFlagMock,
  createOrganization: createOrganizationMock,
}))

import { ensureRetailOrg } from '../retail-org'

describe('ensureRetailOrg', () => {
  beforeEach(() => {
    findUserOrgByMetadataFlagMock.mockReset()
    createOrganizationMock.mockReset()
  })

  it('returns the existing retail org when one is already tagged', async () => {
    findUserOrgByMetadataFlagMock.mockResolvedValue('org-existing')

    const id = await ensureRetailOrg('user-1')
    expect(id).toBe('org-existing')
    expect(findUserOrgByMetadataFlagMock).toHaveBeenCalledWith('user-1', 'retail_personal_org')
    expect(createOrganizationMock).not.toHaveBeenCalled()
  })

  it('creates a new org when the user has no tagged org', async () => {
    findUserOrgByMetadataFlagMock.mockResolvedValue(null)
    createOrganizationMock.mockResolvedValue('org-new')

    const id = await ensureRetailOrg('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(id).toBe('org-new')

    const arg = createOrganizationMock.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.metadata).toEqual({ retail_personal_org: true })
    expect(arg.type).toBe('personal')
    expect(arg.name).toBe('My agents')
    expect(typeof arg.slug).toBe('string')
    expect((arg.slug as string).startsWith('retail-')).toBe(true)
    expect((arg.slug as string).length).toBeLessThanOrEqual(60)
    // Full UUID hex (32 chars), not a 16-char truncation
    expect(arg.slug).toBe('retail-aaaaaaaabbbbccccddddeeeeeeeeeeee')
  })

  it('creates an org when the user has none', async () => {
    findUserOrgByMetadataFlagMock.mockResolvedValue(null)
    createOrganizationMock.mockResolvedValue('org-fresh')

    const id = await ensureRetailOrg('user-zero')
    expect(id).toBe('org-fresh')
    expect(createOrganizationMock).toHaveBeenCalledTimes(1)
  })

  it('recovers from a unique-violation race by re-reading the winner', async () => {
    // First lookup: nobody home.
    // Second lookup (after 23505): the concurrent winner has committed.
    findUserOrgByMetadataFlagMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('org-winner')

    const uniqueViolation: Error & { code?: string } = new Error('duplicate key')
    uniqueViolation.code = '23505'
    createOrganizationMock.mockRejectedValue(uniqueViolation)

    const id = await ensureRetailOrg('user-racer')
    expect(id).toBe('org-winner')
    expect(findUserOrgByMetadataFlagMock).toHaveBeenCalledTimes(2)
  })

  it('rethrows non-unique-violation errors from createOrganization', async () => {
    findUserOrgByMetadataFlagMock.mockResolvedValue(null)
    const dbDown: Error & { code?: string } = new Error('connection refused')
    dbDown.code = 'ECONNREFUSED'
    createOrganizationMock.mockRejectedValue(dbDown)

    await expect(ensureRetailOrg('user-broken')).rejects.toThrow('connection refused')
  })

  it('surfaces a clear race error when the re-read never finds the winner', async () => {
    // Pathological case: 23505 fires but every retry re-read still returns
    // null (e.g. slug collision with a non-retail org, or the winner's
    // membership insert never committed). We must not loop forever or
    // swallow into the original 23505 — surface a dedicated error so ops
    // can see it in logs.
    findUserOrgByMetadataFlagMock.mockResolvedValue(null)
    const uniqueViolation: Error & { code?: string } = new Error('duplicate key')
    uniqueViolation.code = '23505'
    createOrganizationMock.mockRejectedValue(uniqueViolation)

    await expect(ensureRetailOrg('user-pathological')).rejects.toThrow(
      /Retail org provisioning race/,
    )
    // 1 initial read + 5 retries inside the recovery loop
    expect(findUserOrgByMetadataFlagMock).toHaveBeenCalledTimes(6)
  })

  it('recovers mid-retry if the winner commits membership after a short delay', async () => {
    // First call = initial check (null), then 23505, then retries: null,
    // null, then winner shows up on the third re-read inside the loop.
    findUserOrgByMetadataFlagMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('org-late-winner')

    const uniqueViolation: Error & { code?: string } = new Error('duplicate key')
    uniqueViolation.code = '23505'
    createOrganizationMock.mockRejectedValue(uniqueViolation)

    const id = await ensureRetailOrg('user-late-racer')
    expect(id).toBe('org-late-winner')
    expect(findUserOrgByMetadataFlagMock).toHaveBeenCalledTimes(4)
  })
})
