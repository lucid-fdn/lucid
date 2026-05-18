import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

vi.mock('@/lib/access-control/server', () => ({
  getResolvedPlanLimits: vi.fn(),
}))

vi.mock('@/lib/auth/internal', () => ({
  isInternalOrg: vi.fn(),
}))

vi.mock('@/lib/deployment-mode', () => ({
  isSelfHosted: vi.fn(),
}))

import { canUseManagedRuntime, canUseByo } from '../plan-check'
import { getResolvedPlanLimits } from '@/lib/access-control/server'
import { PLAN_DEFAULTS, type WorkspacePlan } from '@/lib/access-control/types'
import { isInternalOrg } from '@/lib/auth/internal'
import { isSelfHosted } from '@/lib/deployment-mode'

const mockGetResolvedPlanLimits = vi.mocked(getResolvedPlanLimits)
const mockIsInternalOrg = vi.mocked(isInternalOrg)
const mockIsSelfHosted = vi.mocked(isSelfHosted)

const ORG_ID = 'org-123'

function mockPlan(planName: string | null) {
  mockGetResolvedPlanLimits.mockResolvedValue(PLAN_DEFAULTS[planName as WorkspacePlan] ?? PLAN_DEFAULTS.starter)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsSelfHosted.mockReturnValue(false)
  mockIsInternalOrg.mockReturnValue(false)
})

describe('canUseManagedRuntime', () => {
  it('returns true for self-hosted regardless of plan', async () => {
    mockIsSelfHosted.mockReturnValue(true)
    mockPlan(null)
    expect(await canUseManagedRuntime(ORG_ID)).toBe(true)
  })

  it('returns true for internal org regardless of plan', async () => {
    mockIsInternalOrg.mockReturnValue(true)
    mockPlan(null)
    expect(await canUseManagedRuntime(ORG_ID)).toBe(true)
  })

  it('returns false for starter plan', async () => {
    mockPlan('starter')
    expect(await canUseManagedRuntime(ORG_ID)).toBe(false)
  })

  it('returns false for no subscription', async () => {
    mockPlan(null)
    expect(await canUseManagedRuntime(ORG_ID)).toBe(false)
  })

  it('returns true for pro plan', async () => {
    mockPlan('pro')
    expect(await canUseManagedRuntime(ORG_ID)).toBe(true)
  })

  it('returns true for business plan', async () => {
    mockPlan('business')
    expect(await canUseManagedRuntime(ORG_ID)).toBe(true)
  })
})

describe('canUseByo', () => {
  it('returns true for self-hosted regardless of plan', async () => {
    mockIsSelfHosted.mockReturnValue(true)
    mockPlan(null)
    expect(await canUseByo(ORG_ID)).toBe(true)
  })

  it('returns true for internal org regardless of plan', async () => {
    mockIsInternalOrg.mockReturnValue(true)
    mockPlan(null)
    expect(await canUseByo(ORG_ID)).toBe(true)
  })

  it('returns false for starter plan', async () => {
    mockPlan('starter')
    expect(await canUseByo(ORG_ID)).toBe(false)
  })

  it('returns false for pro plan', async () => {
    mockPlan('pro')
    expect(await canUseByo(ORG_ID)).toBe(false)
  })

  it('returns false for no subscription', async () => {
    mockPlan(null)
    expect(await canUseByo(ORG_ID)).toBe(false)
  })

  it('returns true for business plan', async () => {
    mockPlan('business')
    expect(await canUseByo(ORG_ID)).toBe(true)
  })
})
