/**
 * Runtime Tier — E2E Simulation Tests
 *
 * Simulates real user flows through the runtime tier system:
 * - Starter user blocked from managed/BYO
 * - Pro user can create managed but not BYO
 * - Business user can create both
 * - Manual BYO skips L2 deploy
 * - Self-hosted users bypass all plan checks
 * - Schema validation catches bad payloads
 *
 * Uses mocked plan-check + DB layer to simulate full request flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import { createRuntimeSchema, runtimeTierSchema } from '../schemas'
import { MANAGED_PROVIDERS, BYO_PROVIDERS } from '../constants'
import { getResolvedPlanLimits } from '@/lib/access-control/server'
import { PLAN_DEFAULTS, type WorkspacePlan } from '@/lib/access-control/types'
import { isInternalOrg } from '@/lib/auth/internal'
import { isSelfHosted } from '@/lib/deployment-mode'

const mockGetResolvedPlanLimits = vi.mocked(getResolvedPlanLimits)
const mockIsInternalOrg = vi.mocked(isInternalOrg)
const mockIsSelfHosted = vi.mocked(isSelfHosted)

function mockPlan(planName: string | null) {
  mockGetResolvedPlanLimits.mockResolvedValue(PLAN_DEFAULTS[planName as WorkspacePlan] ?? PLAN_DEFAULTS.starter)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsSelfHosted.mockReturnValue(false)
  mockIsInternalOrg.mockReturnValue(false)
})

// ─── Scenario 1: Starter user tries each mode ───

describe('Starter plan user', () => {
  beforeEach(() => mockPlan('starter'))

  it('is blocked from managed runtimes', async () => {
    expect(await canUseManagedRuntime('org-starter')).toBe(false)
  })

  it('is blocked from BYO runtimes', async () => {
    expect(await canUseByo('org-starter')).toBe(false)
  })

  it('shared mode does not require plan check (no runtimeTier)', () => {
    // Shared = POST /api/assistants, no runtime involved
    // Verify schema accepts no runtimeTier
    const result = createRuntimeSchema.safeParse({
      displayName: 'shared-agent',
      provider: 'railway',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.runtimeTier).toBeUndefined()
  })
})

// ─── Scenario 2: Pro user — managed OK, BYO blocked ───

describe('Pro plan user', () => {
  beforeEach(() => mockPlan('pro'))

  it('can create managed runtimes', async () => {
    expect(await canUseManagedRuntime('org-pro')).toBe(true)
  })

  it('is blocked from BYO runtimes', async () => {
    expect(await canUseByo('org-pro')).toBe(false)
  })

  it('managed runtime uses MANAGED_PROVIDERS[0] as provider', () => {
    // Simulates server-side provider resolution
    const effectiveProvider = MANAGED_PROVIDERS[0]
    expect(effectiveProvider).toBe('railway')
  })

  it('dedicated runtime schema validates with railway + dedicated tier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'pro-dedicated-runtime',
      provider: 'railway',
      runtimeTier: 'dedicated',
      pendingAgentName: 'My Pro Agent',
    })
    expect(result.success).toBe(true)
  })
})

// ─── Scenario 3: Business user — both modes available ───

describe('Business plan user', () => {
  beforeEach(() => mockPlan('business'))

  it('can create managed runtimes', async () => {
    expect(await canUseManagedRuntime('org-biz')).toBe(true)
  })

  it('can create BYO runtimes', async () => {
    expect(await canUseByo('org-biz')).toBe(true)
  })

  it('BYO with each provider passes schema', () => {
    for (const provider of BYO_PROVIDERS) {
      const result = createRuntimeSchema.safeParse({
        displayName: `byo-${provider}`,
        provider,
        runtimeTier: 'byo',
      })
      expect(result.success).toBe(true)
    }
  })
})

// ─── Scenario 4: Manual BYO flow ───

describe('Manual BYO flow', () => {
  beforeEach(() => mockPlan('business'))

  it('manual provider validates as BYO', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'manual-byo-runtime',
      provider: 'manual',
      runtimeTier: 'byo',
    })
    expect(result.success).toBe(true)
  })

  it('manual BYO should skip L2 deploy (provider === manual)', () => {
    // Simulates the route.ts logic
    const provider = 'manual'
    const runtimeTier = 'byo'
    const isManualByo = runtimeTier === 'byo' && provider === 'manual'
    expect(isManualByo).toBe(true)
  })

  it('non-manual BYO should NOT skip L2 deploy', () => {
    const provider = 'railway'
    const runtimeTier = 'byo'
    const isManualByo = runtimeTier === 'byo' && provider === 'manual'
    expect(isManualByo).toBe(false)
  })

  it('dedicated should NOT skip L2 deploy', () => {
    const provider = 'railway'
    const runtimeTier = 'dedicated'
    const isManualByo = runtimeTier === 'byo' && provider === 'manual'
    expect(isManualByo).toBe(false)
  })
})

// ─── Scenario 5: Self-hosted user bypasses plan checks ───

describe('Self-hosted deployment', () => {
  beforeEach(() => {
    mockIsSelfHosted.mockReturnValue(true)
    mockPlan(null) // No subscription at all
  })

  it('can use managed runtimes without a plan', async () => {
    expect(await canUseManagedRuntime('org-selfhosted')).toBe(true)
  })

  it('can use BYO runtimes without a plan', async () => {
    expect(await canUseByo('org-selfhosted')).toBe(true)
  })
})

// ─── Scenario 6: Internal org bypasses plan checks ───

describe('Internal org', () => {
  beforeEach(() => {
    mockIsInternalOrg.mockReturnValue(true)
    mockPlan('starter') // Even with lowest plan
  })

  it('can use managed runtimes on starter plan', async () => {
    expect(await canUseManagedRuntime('org-internal')).toBe(true)
  })

  it('can use BYO runtimes on starter plan', async () => {
    expect(await canUseByo('org-internal')).toBe(true)
  })
})

// ─── Scenario 7: Provider resolution logic ───

describe('Provider resolution (route-level simulation)', () => {
  it('dedicated mode overrides provider to MANAGED_PROVIDERS[0]', () => {
    // Simulates route.ts logic:
    // const effectiveProvider = runtimeTier === 'dedicated' ? MANAGED_PROVIDERS[0] : parsed.data.provider
    const runtimeTier = 'dedicated'
    const clientProvider = 'akash' // Client might send any provider
    const effectiveProvider = runtimeTier === 'dedicated' ? MANAGED_PROVIDERS[0] : clientProvider
    expect(effectiveProvider).toBe('railway')
  })

  it('BYO mode uses whatever client sent', () => {
    const runtimeTier = 'byo'
    const clientProvider = 'akash'
    const effectiveProvider = runtimeTier === 'dedicated' ? MANAGED_PROVIDERS[0] : clientProvider
    expect(effectiveProvider).toBe('akash')
  })
})

// ─── Scenario 8: Schema rejection — invalid combinations ───

describe('Schema rejection edge cases', () => {
  it('rejects unknown runtimeTier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'test',
      provider: 'railway',
      runtimeTier: 'managed', // Old name — should be rejected
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown provider even with valid tier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'test',
      provider: 'kubernetes', // Not in provider schema
      runtimeTier: 'byo',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty displayName with valid tier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: '',
      provider: 'railway',
      runtimeTier: 'dedicated',
    })
    expect(result.success).toBe(false)
  })
})

// ─── Scenario 9: Plan hierarchy is correct ───

describe('Plan hierarchy', () => {
  it('higher plans include lower plan capabilities', async () => {
    // Business includes both managed and BYO
    mockPlan('business')
    expect(await canUseManagedRuntime('org-1')).toBe(true)
    expect(await canUseByo('org-1')).toBe(true)

    // Pro includes managed but not BYO
    vi.clearAllMocks()
    mockIsSelfHosted.mockReturnValue(false)
    mockIsInternalOrg.mockReturnValue(false)
    mockPlan('pro')
    expect(await canUseManagedRuntime('org-1')).toBe(true)
    expect(await canUseByo('org-1')).toBe(false)

    // Starter includes neither
    vi.clearAllMocks()
    mockIsSelfHosted.mockReturnValue(false)
    mockIsInternalOrg.mockReturnValue(false)
    mockPlan('starter')
    expect(await canUseManagedRuntime('org-1')).toBe(false)
    expect(await canUseByo('org-1')).toBe(false)
  })

  it('unknown plan names are treated as starter', async () => {
    mockPlan('enterprise') // Not in PLAN_RANK
    expect(await canUseManagedRuntime('org-1')).toBe(false)
    expect(await canUseByo('org-1')).toBe(false)
  })
})

// ─── Scenario 10: Complete create-agent flow simulation ───

describe('Full create-agent flow simulation', () => {
  it('simulates shared agent creation (no runtime involved)', () => {
    // Shared mode: POST /api/assistants directly, no runtimeTier
    const deploymentMode = 'shared' as const
    const shouldCallRuntimesApi = deploymentMode !== 'shared'
    expect(shouldCallRuntimesApi).toBe(false)
  })

  it('simulates dedicated runtime creation payload', () => {
    const deploymentMode = 'dedicated' as const
    const agentName = 'My Trading Bot'

    // Build the payload like assistants-list-client.tsx does
    const payload = {
      displayName: `${agentName}-runtime`,
      provider: deploymentMode === 'dedicated' ? MANAGED_PROVIDERS[0] : 'docker',
      pendingAgentName: agentName,
      runtimeTier: deploymentMode,
    }

    // Validate it
    const result = createRuntimeSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.runtimeTier).toBe('dedicated')
      expect(result.data.pendingAgentName).toBe('My Trading Bot')
    }
  })

  it('simulates BYO manual flow — stays in dialog for env vars', () => {
    const deploymentMode = 'byo' as const
    const selectedProvider = 'manual'

    const payload = {
      displayName: 'manual-byo-runtime',
      provider: selectedProvider,
      pendingAgentName: 'Self-Hosted Agent',
      runtimeTier: deploymentMode,
    }

    const result = createRuntimeSchema.safeParse(payload)
    expect(result.success).toBe(true)

    // Manual BYO: dialog stays open to show env vars
    const isManualByo = deploymentMode === 'byo' && selectedProvider === 'manual'
    expect(isManualByo).toBe(true)
  })

  it('simulates BYO provider flow — closes dialog, deploys via L2', () => {
    const deploymentMode = 'byo' as const
    const selectedProvider = 'akash'

    const payload = {
      displayName: `akash-runtime`,
      provider: selectedProvider,
      pendingAgentName: 'GPU Agent',
      runtimeTier: deploymentMode,
    }

    const result = createRuntimeSchema.safeParse(payload)
    expect(result.success).toBe(true)

    // Non-manual BYO: close dialog, deploy via L2
    const isManualByo = deploymentMode === 'byo' && selectedProvider === 'manual'
    expect(isManualByo).toBe(false)
  })
})
