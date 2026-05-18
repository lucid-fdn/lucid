/**
 * Crew Context — Unit Tests
 *
 * Tests crew context loading, system prompt rendering, and topology enforcement.
 * Pure unit tests with mocked Supabase — no DB calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getActiveCrewContext,
  renderCrewContextPrompt,
  canCrewMembersCommunicate,
  toolCrewComplete,
  type CrewContext,
} from '../crew-context.js'

// ─── Mock Supabase ───

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    from: vi.fn((table: string) => {
      if (overrides[table]) return overrides[table]
      return defaultChain
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any
}

// ─── Fixtures ───

function createCrewContext(overrides: Partial<CrewContext> = {}): CrewContext {
  return {
    crewId: 'crew-1',
    crewName: 'Research Team',
    objective: 'Find and synthesize market data',
    myMemberId: 'member-1',
    myRole: 'coordinator',
    myRoleDescription: null,
    isCoordinator: true,
    topologyEnforced: false,
    members: [
      { memberId: 'member-1', assistantId: 'assistant-1', name: 'CoordBot', role: 'coordinator' },
      { memberId: 'member-2', assistantId: 'assistant-2', name: 'ResearchBot', role: 'researcher' },
      { memberId: 'member-3', assistantId: 'assistant-3', name: 'WriterBot', role: 'writer' },
    ],
    allowedTargetAssistantIds: null,
    ...overrides,
  }
}

// ─── getActiveCrewContext ───

describe('getActiveCrewContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when assistant has no crew membership', async () => {
    const sb = createMockSupabase()
    const result = await getActiveCrewContext(sb, 'lonely-assistant')
    expect(result).toBeNull()
  })

  it('returns null on DB error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
    }
    const sb = createMockSupabase({ crew_members: chain })
    const result = await getActiveCrewContext(sb, 'assistant-1')
    expect(result).toBeNull()
  })

  it('returns null when crew is archived', async () => {
    const membershipChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'member-1',
          crew_id: 'crew-1',
          role: 'researcher',
          role_description: null,
          is_coordinator: false,
          crews: { id: 'crew-1', name: 'Old Team', objective: 'Done', status: 'archived', topology_enforced: false, deleted_at: null },
        },
        error: null,
      }),
    }
    const sb = createMockSupabase({ crew_members: membershipChain })
    const result = await getActiveCrewContext(sb, 'assistant-1')
    expect(result).toBeNull()
  })

  it('loads full crew context with members for active crew', async () => {
    const membershipChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'member-1',
          crew_id: 'crew-1',
          role: 'coordinator',
          role_description: 'Lead the team',
          is_coordinator: true,
          crews: { id: 'crew-1', name: 'Alpha Team', objective: 'Research markets', status: 'active', topology_enforced: false, deleted_at: null },
        },
        error: null,
      }),
    }

    const membersData = [
      { id: 'member-1', assistant_id: 'assistant-1', role: 'coordinator', ai_assistants: { name: 'CoordBot' } },
      { id: 'member-2', assistant_id: 'assistant-2', role: 'researcher', ai_assistants: { name: 'ResearchBot' } },
    ]

    // Separate chain for members query (second call to crew_members)
    let callCount = 0
    const sb = createMockSupabase()
    sb.from = vi.fn((table: string) => {
      if (table === 'crew_members') {
        callCount++
        if (callCount === 1) return membershipChain
        // Second call: members list
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => void) => {
            resolve({ data: membersData, error: null })
            return { then: () => {} }
          },
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => {
          resolve({ data: null })
          return { then: () => {} }
        },
      }
    })

    const result = await getActiveCrewContext(sb, 'assistant-1')

    expect(result).not.toBeNull()
    expect(result!.crewName).toBe('Alpha Team')
    expect(result!.objective).toBe('Research markets')
    expect(result!.isCoordinator).toBe(true)
    expect(result!.myRole).toBe('coordinator')
    expect(result!.myRoleDescription).toBe('Lead the team')
    expect(result!.topologyEnforced).toBe(false)
    expect(result!.allowedTargetAssistantIds).toBeNull()
    expect(result!.members).toHaveLength(2)
  })
})

// ─── renderCrewContextPrompt ───

describe('renderCrewContextPrompt', () => {
  it('renders basic crew context', () => {
    const ctx = createCrewContext()
    const prompt = renderCrewContextPrompt(ctx)

    expect(prompt).toContain('## Crew: Research Team')
    expect(prompt).toContain('**Objective:** Find and synthesize market data')
    expect(prompt).toContain('**Your role:** coordinator')
    expect(prompt).toContain('**Crew members:**')
    expect(prompt).toContain('- CoordBot: coordinator (you)')
    expect(prompt).toContain('- ResearchBot: researcher')
    expect(prompt).toContain('- WriterBot: writer')
  })

  it('includes coordinator instruction for coordinators', () => {
    const ctx = createCrewContext({ isCoordinator: true })
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt).toContain('**coordinator**')
    expect(prompt).toContain('Delegate tasks to members via sessions_send')
  })

  it('does NOT include coordinator instruction for non-coordinators', () => {
    const ctx = createCrewContext({ isCoordinator: false })
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt).not.toContain('You are the **coordinator**')
  })

  it('includes role description when provided', () => {
    const ctx = createCrewContext({ myRoleDescription: 'Primary data analyst for market trends' })
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt).toContain('**Role details:** Primary data analyst for market trends')
  })

  it('shows allowed targets when topology is enforced', () => {
    const ctx = createCrewContext({
      topologyEnforced: true,
      allowedTargetAssistantIds: ['assistant-2'],
    })
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt).toContain('**You can message:** ResearchBot')
    expect(prompt).toContain('Messages to other crew members are blocked')
  })

  it('does NOT show allowed targets when topology is not enforced', () => {
    const ctx = createCrewContext({ topologyEnforced: false })
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt).not.toContain('You can message')
  })

  it('caps member list at MAX_DISPLAY_MEMBERS (15)', () => {
    const members = Array.from({ length: 20 }, (_, i) => ({
      memberId: `m-${i}`,
      assistantId: `a-${i}`,
      name: `Bot${i}`,
      role: `role${i}`,
    }))
    const ctx = createCrewContext({ members })
    const prompt = renderCrewContextPrompt(ctx)

    // Should contain Bot0-Bot14 but not Bot15+
    expect(prompt).toContain('Bot14')
    expect(prompt).not.toContain('Bot15')
  })

  it('stays within budget (~1500 chars for 15 members)', () => {
    const members = Array.from({ length: 15 }, (_, i) => ({
      memberId: `m-${i}`,
      assistantId: `a-${i}`,
      name: `Agent${i}`,
      role: `role${i}`,
    }))
    const ctx = createCrewContext({
      members,
      topologyEnforced: true,
      allowedTargetAssistantIds: members.slice(0, 5).map(m => m.assistantId),
    })
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt.length).toBeLessThan(1500)
  })
})

// ─── canCrewMembersCommunicate ───

describe('canCrewMembersCommunicate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows communication if target is not in the same crew', async () => {
    const sb = createMockSupabase()
    const ctx = createCrewContext()
    const result = await canCrewMembersCommunicate(sb, ctx, 'external-assistant')
    expect(result.allowed).toBe(true)
  })

  it('allows communication when RPC returns true', async () => {
    const sb = createMockSupabase()
    sb.rpc = vi.fn().mockResolvedValue({ data: true, error: null })

    const ctx = createCrewContext()
    const result = await canCrewMembersCommunicate(sb, ctx, 'assistant-2')

    expect(result.allowed).toBe(true)
    expect(sb.rpc).toHaveBeenCalledWith('can_crew_members_communicate', {
      p_crew_id: 'crew-1',
      p_source_assistant_id: 'assistant-1',
      p_target_assistant_id: 'assistant-2',
    })
  })

  it('blocks communication when RPC returns false', async () => {
    const sb = createMockSupabase()
    sb.rpc = vi.fn().mockResolvedValue({ data: false, error: null })

    const ctx = createCrewContext({
      topologyEnforced: true,
      allowedTargetAssistantIds: ['assistant-2'],
    })
    const result = await canCrewMembersCommunicate(sb, ctx, 'assistant-3')

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('topology')
    expect(result.allowedTargets).toContain('ResearchBot')
    expect(result.allowedTargets).not.toContain('WriterBot')
  })

  it('fails open on RPC error (never blocks due to infra issues)', async () => {
    const sb = createMockSupabase()
    sb.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC timeout' } })
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ctx = createCrewContext()
    const result = await canCrewMembersCommunicate(sb, ctx, 'assistant-2')

    expect(result.allowed).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Topology check failed'))
    consoleSpy.mockRestore()
  })
})

// ─── toolCrewComplete ───

describe('toolCrewComplete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when caller is not in a crew', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolCrewComplete(
        { outcome_summary: 'done' },
        { supabase: sb, assistantId: 'a-1', orgId: 'org-1', crewContext: null },
      ),
    )
    expect(result.error).toMatch(/not a member/)
  })

  it('rejects when caller is not the coordinator', async () => {
    const sb = createMockSupabase()
    const ctx = createCrewContext({ isCoordinator: false })
    const result = JSON.parse(
      await toolCrewComplete(
        { outcome_summary: 'done' },
        { supabase: sb, assistantId: 'a-1', orgId: 'org-1', crewContext: ctx },
      ),
    )
    expect(result.error).toMatch(/coordinator/)
  })

  it('rejects when no active crew run exists', async () => {
    const sb = createMockSupabase({
      crew_runs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    })
    const ctx = createCrewContext({ isCoordinator: true })
    const result = JSON.parse(
      await toolCrewComplete(
        { outcome_summary: 'done' },
        { supabase: sb, assistantId: 'a-1', orgId: 'org-1', crewContext: ctx },
      ),
    )
    expect(result.error).toMatch(/No active crew run/)
  })

  it('completes an active crew run successfully', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const mockInsert = vi.fn().mockReturnValue({
      then: vi.fn().mockReturnValue({ catch: vi.fn() }),
    })
    const sb = createMockSupabase({
      crew_runs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }),
        update: mockUpdate,
      },
      crew_run_members: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [{ cost_usd: 0.5 }, { cost_usd: 0.3 }], error: null }),
      },
      mc_agent_events: {
        insert: mockInsert,
      },
    })
    const ctx = createCrewContext({ isCoordinator: true })
    const result = JSON.parse(
      await toolCrewComplete(
        { outcome_summary: 'All tasks done' },
        { supabase: sb, assistantId: 'a-1', orgId: 'org-1', crewContext: ctx },
      ),
    )
    expect(result.success).toBe(true)
    expect(result.crew_run_id).toBe('run-1')
    expect(result.status).toBe('completed')
  })

  it('allows marking a run as failed', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const mockInsert = vi.fn().mockReturnValue({
      then: vi.fn().mockReturnValue({ catch: vi.fn() }),
    })
    const sb = createMockSupabase({
      crew_runs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'run-2' }, error: null }),
        update: mockUpdate,
      },
      crew_run_members: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      },
      mc_agent_events: {
        insert: mockInsert,
      },
    })
    const ctx = createCrewContext({ isCoordinator: true })
    const result = JSON.parse(
      await toolCrewComplete(
        { outcome_summary: 'Could not complete', status: 'failed' },
        { supabase: sb, assistantId: 'a-1', orgId: 'org-1', crewContext: ctx },
      ),
    )
    expect(result.success).toBe(true)
    expect(result.status).toBe('failed')
  })
})
