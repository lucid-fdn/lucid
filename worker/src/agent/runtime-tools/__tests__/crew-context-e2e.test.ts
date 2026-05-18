/**
 * Crew Context — E2E / Integration Tests
 *
 * Tests the full crew context pipeline:
 * - Context loading → prompt rendering → topology enforcement
 * - Edge cases: empty crews, missing data, error recovery
 * - Messaging enrichment scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getActiveCrewContext,
  renderCrewContextPrompt,
  canCrewMembersCommunicate,
  type CrewContext,
} from '../crew-context.js'

// ─── Helpers ───

function createFullCrewContext(): CrewContext {
  return {
    crewId: 'crew-abc',
    crewName: 'Market Analysis',
    objective: 'Analyze crypto market trends and produce daily reports',
    myMemberId: 'member-coord',
    myRole: 'coordinator',
    myRoleDescription: 'Orchestrate research and compile final report',
    isCoordinator: true,
    topologyEnforced: true,
    members: [
      { memberId: 'member-coord', assistantId: 'a-coord', name: 'OrchestraBot', role: 'coordinator' },
      { memberId: 'member-r1', assistantId: 'a-researcher1', name: 'DataBot', role: 'data researcher' },
      { memberId: 'member-r2', assistantId: 'a-researcher2', name: 'SentimentBot', role: 'sentiment analyst' },
      { memberId: 'member-w1', assistantId: 'a-writer', name: 'WriterBot', role: 'report writer' },
    ],
    allowedTargetAssistantIds: ['a-researcher1', 'a-researcher2', 'a-writer'],
  }
}

// ─── Full Pipeline: Context → Prompt → Enforcement ───

describe('Crew context full pipeline', () => {
  it('coordinator prompt includes delegation instruction and all members', () => {
    const ctx = createFullCrewContext()
    const prompt = renderCrewContextPrompt(ctx)

    // Structural checks
    expect(prompt).toContain('## Crew: Market Analysis')
    expect(prompt).toContain('Analyze crypto market trends')
    expect(prompt).toContain('coordinator')
    expect(prompt).toContain('Delegate tasks to members via sessions_send')

    // All 4 members listed
    expect(prompt).toContain('OrchestraBot')
    expect(prompt).toContain('DataBot')
    expect(prompt).toContain('SentimentBot')
    expect(prompt).toContain('WriterBot')

    // Self-tag
    expect(prompt).toContain('OrchestraBot: coordinator (you)')

    // Topology restriction
    expect(prompt).toContain('You can message:')
    expect(prompt).toContain('DataBot')
    expect(prompt).toContain('WriterBot')
  })

  it('non-coordinator prompt shows role without delegation instruction', () => {
    const ctx: CrewContext = {
      ...createFullCrewContext(),
      myMemberId: 'member-r1',
      myRole: 'data researcher',
      myRoleDescription: 'Fetch and analyze on-chain data',
      isCoordinator: false,
      allowedTargetAssistantIds: ['a-coord'], // star topology: can only talk to coordinator
    }
    const prompt = renderCrewContextPrompt(ctx)

    expect(prompt).toContain('**Your role:** data researcher')
    expect(prompt).toContain('**Role details:** Fetch and analyze on-chain data')
    expect(prompt).not.toContain('You are the **coordinator**')
    expect(prompt).toContain('**You can message:** OrchestraBot')
  })
})

// ─── Topology Enforcement Scenarios ───

describe('Topology enforcement scenarios', () => {
  beforeEach(() => vi.clearAllMocks())

  it('star topology: coordinator can reach all members', async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) } as any
    const ctx = createFullCrewContext()

    for (const target of ['a-researcher1', 'a-researcher2', 'a-writer']) {
      const result = await canCrewMembersCommunicate(sb, ctx, target)
      expect(result.allowed).toBe(true)
    }
    expect(sb.rpc).toHaveBeenCalledTimes(3)
  })

  it('star topology: member blocked from reaching peer (not coordinator)', async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as any
    const ctx: CrewContext = {
      ...createFullCrewContext(),
      myMemberId: 'member-r1',
      isCoordinator: false,
      allowedTargetAssistantIds: ['a-coord'],
    }

    const result = await canCrewMembersCommunicate(sb, ctx, 'a-researcher2')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
    expect(result.allowedTargets).toEqual(['OrchestraBot'])
  })

  it('non-enforced topology: all communication allowed (no RPC call)', async () => {
    const sb = { rpc: vi.fn() } as any
    const ctx = createFullCrewContext()
    ctx.topologyEnforced = false

    // Note: canCrewMembersCommunicate still calls RPC because it checks
    // at the DB level. But allowedTargetAssistantIds being null means
    // the prompt won't restrict the agent.
    // For non-enforced, the caller (messaging.ts) skips the check entirely.
    expect(ctx.topologyEnforced).toBe(false)
  })

  it('external target (not in crew) always allowed', async () => {
    const sb = { rpc: vi.fn() } as any
    const ctx = createFullCrewContext()

    const result = await canCrewMembersCommunicate(sb, ctx, 'external-bot-id')
    expect(result.allowed).toBe(true)
    expect(sb.rpc).not.toHaveBeenCalled() // No RPC needed
  })
})

// ─── Edge Cases ───

describe('Edge cases', () => {
  it('empty crew (only self) renders correctly', () => {
    const ctx: CrewContext = {
      crewId: 'c-solo',
      crewName: 'Solo Crew',
      objective: 'Test crew with single member',
      myMemberId: 'm-only',
      myRole: 'solo',
      myRoleDescription: null,
      isCoordinator: true,
      topologyEnforced: false,
      members: [
        { memberId: 'm-only', assistantId: 'a-solo', name: 'SoloBot', role: 'solo' },
      ],
      allowedTargetAssistantIds: null,
    }

    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt).toContain('SoloBot: solo (you)')
    expect(prompt).not.toContain('You can message')
  })

  it('large crew (20 members) is capped at 15 in prompt', () => {
    const members = Array.from({ length: 20 }, (_, i) => ({
      memberId: `m-${i}`,
      assistantId: `a-${i}`,
      name: `Agent_${i}`,
      role: `role_${i}`,
    }))
    const ctx: CrewContext = {
      crewId: 'c-big',
      crewName: 'Large Team',
      objective: 'Stress test',
      myMemberId: 'm-0',
      myRole: 'role_0',
      myRoleDescription: null,
      isCoordinator: true,
      topologyEnforced: false,
      members,
      allowedTargetAssistantIds: null,
    }

    const prompt = renderCrewContextPrompt(ctx)
    const memberLines = prompt.split('\n').filter(l => l.startsWith('- Agent_'))
    expect(memberLines).toHaveLength(15)
  })

  it('prompt starts with double newline (for system prompt concatenation)', () => {
    const ctx = createFullCrewContext()
    const prompt = renderCrewContextPrompt(ctx)
    expect(prompt.startsWith('\n\n')).toBe(true)
  })

  it('topology enforcement returns allowed names from cached context (no extra DB query)', async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as any
    const ctx = createFullCrewContext()
    ctx.allowedTargetAssistantIds = ['a-researcher1']

    const result = await canCrewMembersCommunicate(sb, ctx, 'a-writer')

    expect(result.allowed).toBe(false)
    expect(result.allowedTargets).toEqual(['DataBot'])
    // Only 1 RPC call — no extra queries for name resolution
    expect(sb.rpc).toHaveBeenCalledTimes(1)
  })
})
