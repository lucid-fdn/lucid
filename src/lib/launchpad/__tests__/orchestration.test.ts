import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Mock server-only (imported by launchpad/index.ts)
vi.mock('server-only', () => ({}))

// Mock the DB module before importing
vi.mock('@/lib/db/launchpad', () => ({
  getLaunchedAgentBySlug: vi.fn(),
  getLaunchedAgentById: vi.fn(),
  createLaunchedAgent: vi.fn(),
  updateLaunchedAgent: vi.fn(),
}))

// Mock dynamic imports that launchAgent() loads at runtime
vi.mock('../wallet-helpers', () => ({
  getOrProvisionAgentWallet: vi.fn().mockResolvedValue(null),
}))

vi.mock('../ensure-org', () => ({
  ensurePersonalOrg: vi.fn().mockResolvedValue('mock-org-id'),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
  const text = typeof chunk === 'string' ? chunk : chunk.toString()
  if (text.includes('bigint: Failed to load bindings')) {
    return true
  }
  return true
}) as typeof process.stderr.write)

import {
  getLaunchedAgentBySlug,
  getLaunchedAgentById,
  createLaunchedAgent,
  updateLaunchedAgent,
} from '@/lib/db/launchpad'

async function loadLaunchpad() {
  return import('../index')
}

const mockAgent = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  assistant_id: 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b',
  creator_id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  creator_wallet: 'SoLWaLLeTaDdReSs123',
  org_id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
  slug: 'test-agent',
  display_name: 'Test Agent',
  description: null,
  avatar_url: null,
  category: 'general' as const,
  tags: [],
  chain: 'solana',
  token_mint: null,
  genesis_pool_id: null,
  token_supply: 1_000_000_000,
  creator_alloc_bps: 1000,
  agent_wallet_address: null,
  wallet_source: 'privy' as const,
  price_per_request: 0.01,
  platform_fee_bps: 1500,
  status: 'draft' as const,
  total_requests: 0,
  total_revenue_usdc: 0,
  total_staked: 0,
  holder_count: 0,
  launched_at: null,
  created_at: '2026-03-07T00:00:00Z',
  updated_at: '2026-03-07T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  consoleWarnSpy.mockRestore()
  consoleErrorSpy.mockRestore()
  stderrWriteSpy.mockRestore()
})

describe('launchAgent', () => {
  it('creates a launched agent when slug is unique', async () => {
    const { launchAgent } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentBySlug).mockResolvedValue(null)
    vi.mocked(createLaunchedAgent).mockResolvedValue(mockAgent)

    const result = await launchAgent({
      assistant_id: mockAgent.assistant_id,
      creator_wallet: mockAgent.creator_wallet,
      org_id: mockAgent.org_id,
      slug: 'test-agent',
      display_name: 'Test Agent',
      creator_id: mockAgent.creator_id!,
    })

    expect(result.error).toBeNull()
    expect(result.agent).toEqual(mockAgent)
    expect(createLaunchedAgent).toHaveBeenCalledOnce()
  })

  it('rejects duplicate slug', async () => {
    const { launchAgent } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentBySlug).mockResolvedValue(mockAgent)

    const result = await launchAgent({
      assistant_id: mockAgent.assistant_id,
      creator_wallet: mockAgent.creator_wallet,
      org_id: mockAgent.org_id,
      slug: 'test-agent',
      display_name: 'Test Agent',
    })

    expect(result.error).toBe('Slug already taken')
    expect(result.agent).toBeNull()
    expect(createLaunchedAgent).not.toHaveBeenCalled()
  })

  it('returns error when create fails', async () => {
    const { launchAgent } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentBySlug).mockResolvedValue(null)
    vi.mocked(createLaunchedAgent).mockResolvedValue(null)

    const result = await launchAgent({
      assistant_id: mockAgent.assistant_id,
      creator_wallet: mockAgent.creator_wallet,
      org_id: mockAgent.org_id,
      slug: 'test-agent',
      display_name: 'Test Agent',
    })

    expect(result.error).toBe('Failed to create launched agent')
  })
}, 20_000)

describe('transitionAgentStatus', () => {
  it('allows draft → launching', async () => {
    const { transitionAgentStatus } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentById).mockResolvedValue({ ...mockAgent, status: 'draft' })
    vi.mocked(updateLaunchedAgent).mockResolvedValue({ ...mockAgent, status: 'launching' })

    const result = await transitionAgentStatus(mockAgent.id, 'launching')
    expect(result.error).toBeNull()
  })

  it('allows launching → trading and sets launched_at', async () => {
    const { transitionAgentStatus } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentById).mockResolvedValue({ ...mockAgent, status: 'launching' })
    vi.mocked(updateLaunchedAgent).mockResolvedValue({ ...mockAgent, status: 'trading' })

    const result = await transitionAgentStatus(mockAgent.id, 'trading')
    expect(result.error).toBeNull()

    const updateCall = vi.mocked(updateLaunchedAgent).mock.calls[0]
    expect(updateCall[1]).toHaveProperty('launched_at')
  })

  it('rejects invalid transitions', async () => {
    const { transitionAgentStatus } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentById).mockResolvedValue({ ...mockAgent, status: 'draft' })

    const result = await transitionAgentStatus(mockAgent.id, 'trading')
    expect(result.error).toBe('Cannot transition from draft to trading')
  })

  it('returns error for non-existent agent', async () => {
    const { transitionAgentStatus } = await loadLaunchpad()
    vi.mocked(getLaunchedAgentById).mockResolvedValue(null)

    const result = await transitionAgentStatus('nonexistent', 'launching')
    expect(result.error).toBe('Agent not found')
  })
}, 20_000)
