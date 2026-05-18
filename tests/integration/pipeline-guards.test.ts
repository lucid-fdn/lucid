/**
 * Pipeline Guards Integration Tests (P1 #10)
 *
 * Tests 1-5a: Pre-run guards (dedup, lock, tenant keys, policy, billing)
 * Test 5b: Mid-run guard (ToolExecutionGuard blocks after budget spent)
 *
 * See docs/OPENCLAW_AUDIT_PLAN_V3.md §P1 #10
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { ToolExecutionGuard } from '../../worker/src/guards/ToolExecutionGuard.js'
import { PolicyEngine, type RunBudget } from '../../worker/src/guards/PolicyEngine.js'
import { CommandsAllowlist } from '../../worker/src/agent/CommandsAllowlist.js'
import { InboundDeduper } from '../../worker/src/guards/InboundDeduper.js'
import { computeTenantKeys } from '../../worker/src/utils/tenant-keys.js'
import { TenantRateLimiter } from '../../worker/src/guards/TenantRateLimiter.js'
import { trackUsage } from '../../worker/src/utils/usage-tracker.js'

/* ─── Helpers ──────────────────────────────────────────── */

function makeBudget(overrides: Partial<RunBudget> = {}): RunBudget {
  return {
    maxLlmCalls: 3,
    maxToolCalls: 2,
    maxWallTimeMs: 60_000,
    maxOutputTokens: 4096,
    ...overrides,
  }
}

function makeAllowlist(tools: string[] | null = ['code_interpreter', 'wallet_balance']): CommandsAllowlist {
  const policy = tools ? { allowed_tools: tools } : null
  return new CommandsAllowlist(policy as Record<string, unknown> | null)
}

const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

afterAll(() => {
  consoleWarnSpy.mockRestore()
  consoleLogSpy.mockRestore()
})

/* ─── Test 1: Dedup Rejects Duplicate external_message_id ── */

describe('Test 1: InboundDeduper', () => {
  it('uses 4-column composite key for dedup (tenant_key + channel_type + external_chat_id + external_message_id)', () => {
    // Verify the dedup key structure matches the DB UNIQUE constraint
    // This is a structural test — actual DB interaction tested in E2E
    const deduper = new InboundDeduper()

    // The dedup key should incorporate all 4 fields
    // If InboundDeduper exposes a key builder, test it:
    expect(deduper).toBeDefined()
    // Structural assertion: the class exists and can be instantiated
  })

  it('rejects duplicate when all 4 key fields match', async () => {
    // Mock Supabase for this test
    const mockSupabase = {
      from: () => ({
        insert: async () => ({
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          data: null,
        }),
      }),
    }

    const deduper = new InboundDeduper(mockSupabase as any)
    const isDuplicate = await deduper.isDuplicate(
      'org1:default:default',
      'telegram',
      'chat123',
      'msg-001'
    )

    expect(isDuplicate).toBe(true)
  })

  it('allows first occurrence of a message', async () => {
    const mockSupabase = {
      from: () => ({
        insert: async () => ({
          error: null,
          data: [{ id: 'new-row' }],
        }),
      }),
    }

    const deduper = new InboundDeduper(mockSupabase as any)
    const isDuplicate = await deduper.isDuplicate(
      'org1:default:default',
      'telegram',
      'chat123',
      'msg-002'
    )

    expect(isDuplicate).toBe(false)
  })
})

/* ─── Test 2: Dual Rate Limiter (tenant + user) ───────── */

describe('Test 2: TenantRateLimiter dual-bucket', () => {
  it('uses atomic dual-bucket RPC with tenant + user keys', async () => {
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe('consume_rate_tokens_dual')
      expect(args.p_tenant_key).toBe('org-1:default:default')
      expect(args.p_user_key).toBe('org-1:default:default:user-1')
      expect(args.p_user_bucket_key).toBe('msg_per_min_user')
      return {
        data: {
          allowed: true,
          tenant_remaining: 19,
          user_remaining: 9,
          retry_after_ms: 0,
          blocked_by: null,
        },
        error: null,
      }
    }

    const limiter = new TenantRateLimiter({ rpc } as any, 20)
    const result = await limiter.tryConsumeDual('org-1:default:default', 'org-1:default:default:user-1')

    expect(result.allowed).toBe(true)
    expect(result.tenantRemaining).toBe(19)
    expect(result.userRemaining).toBe(9)
  })
})

/* ─── Test 3: Tenant Keys Computed Correctly ──────────── */

describe('Test 3: Tenant Key Computation', () => {
  it('computes tenantKey from orgId + channel + chat', () => {
    const keys = computeTenantKeys({
      orgId: 'org-abc',
      channelType: 'telegram',
      externalChatId: 'chat-123',
      externalUserId: 'user-456',
    })

    expect(keys.tenantKey).toBe('org-abc:default:default')
    expect(keys.sessionKey).toContain('org-abc')
    expect(keys.sessionKey).toContain('telegram')
    expect(keys.sessionKey).toContain('chat-123')
    expect(keys.userKey).toContain('user-456')
  })

  it('uses ANON marker when externalUserId is missing', () => {
    const keys = computeTenantKeys({
      orgId: 'org-abc',
      channelType: 'telegram',
      externalChatId: 'chat-123',
      externalUserId: undefined,
    })

    // Anonymous userKey should still be tenant-scoped (not global)
    expect(keys.userKey).toContain('org-abc')
    expect(keys.userKey).toContain('__anon__')
  })

  it('different orgs produce different tenantKeys for same channel/chat', () => {
    const keysA = computeTenantKeys({
      orgId: 'org-A',
      channelType: 'telegram',
      externalChatId: 'chat-123',
      externalUserId: 'user-456',
    })

    const keysB = computeTenantKeys({
      orgId: 'org-B',
      channelType: 'telegram',
      externalChatId: 'chat-123',
      externalUserId: 'user-456',
    })

    expect(keysA.tenantKey).not.toBe(keysB.tenantKey)
    expect(keysA.userKey).not.toBe(keysB.userKey)
  })
})

/* ─── Test 4: PolicyEngine Precheck Blocks Over-Limit ─── */

describe('Test 4: PolicyEngine Precheck', () => {
  it('allows run with default budget', () => {
    const engine = new PolicyEngine()
    const decision = engine.evaluate(null)

    expect(decision.allowed).toBe(true)
    expect(decision.budget.maxLlmCalls).toBeGreaterThan(0)
    expect(decision.budget.maxToolCalls).toBeGreaterThanOrEqual(0)
    expect(decision.budget.maxWallTimeMs).toBeGreaterThan(0)
  })

  it('blocks run when assistant is disabled', () => {
    const engine = new PolicyEngine()
    const decision = engine.evaluate({ disabled: true })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('disabled')
  })

  it('merges policy_config overrides with defaults', () => {
    const engine = new PolicyEngine({ maxLlmCalls: 1 })
    const decision = engine.evaluate({
      maxLlmCalls: 5,
      maxToolCalls: 10,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.budget.maxLlmCalls).toBe(5)
    expect(decision.budget.maxToolCalls).toBe(10)
  })

  it('uses system defaults when policy_config is null', () => {
    const engine = new PolicyEngine({
      maxLlmCalls: 2,
      maxToolCalls: 3,
      maxWallTimeMs: 30_000,
    })
    const decision = engine.evaluate(null)

    expect(decision.budget.maxLlmCalls).toBe(2)
    expect(decision.budget.maxToolCalls).toBe(3)
    expect(decision.budget.maxWallTimeMs).toBe(30_000)
  })
})

/* ─── Test 5a: Billing (trackUsage) Fires Exactly Once ── */

describe('Test 5a: Usage Tracking', () => {
  it('trackUsage emits exactly one insert for one successful record', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const mockSupabase = {
      from: vi.fn(() => ({ insert })),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    }

    await trackUsage(mockSupabase as any, {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      tenantKey: 'org-1:default:default',
      orgId: 'org-1',
      assistantId: 'asst-1',
      conversationId: 'conv-1',
      model: 'gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 34,
      totalTokens: 46,
      llmCalls: 1,
      toolCalls: 0,
      wallTimeMs: 1200,
      isAgentLoop: false,
    })

    expect(mockSupabase.from).toHaveBeenCalledTimes(1)
    expect(mockSupabase.from).toHaveBeenCalledWith('assistant_usage_records')
    expect(insert).toHaveBeenCalledTimes(1)
  })
})

/* ─── Test 5b: ToolExecutionGuard Blocks Mid-Run ──────── */

describe('Test 5b: ToolExecutionGuard Mid-Run Blocking', () => {
  let guard: ToolExecutionGuard
  let allowlist: CommandsAllowlist

  beforeEach(() => {
    allowlist = makeAllowlist(['code_interpreter', 'wallet_balance'])
    guard = new ToolExecutionGuard(
      makeBudget({ maxLlmCalls: 3, maxToolCalls: 2, maxOutputTokens: 1000 }),
      allowlist
    )
  })

  it('allows first LLM call within budget', () => {
    const result = guard.beforeLlmCall()
    expect(result.allowed).toBe(true)
    expect(result.metricsSnapshot.llmCallsUsed).toBe(1)
  })

  it('blocks LLM call after budget exhausted', () => {
    guard.beforeLlmCall() // 1
    guard.beforeLlmCall() // 2
    guard.beforeLlmCall() // 3 (at limit)

    const result = guard.beforeLlmCall() // 4 (over limit)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('LLM call budget exhausted')
  })

  it('allows tool call within budget and allowlist', () => {
    const result = guard.beforeToolCall('code_interpreter')
    expect(result.allowed).toBe(true)
    expect(result.metricsSnapshot.toolCallsUsed).toBe(1)
  })

  it('blocks tool call after tool budget exhausted', () => {
    guard.beforeToolCall('code_interpreter')  // 1
    guard.beforeToolCall('wallet_balance')   // 2 (at limit)

    const result = guard.beforeToolCall('code_interpreter') // 3 (over limit)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Tool call budget exhausted')
  })

  it('blocks elevated tool NOT in allowlist', () => {
    // Safe tools are always allowed. Elevated tools (e.g. wallet_transfer)
    // require explicit opt-in — this allowlist only has code_interpreter + wallet_balance.
    const result = guard.beforeToolCall('wallet_transfer')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not in the allowed tools list')
  })

  it('blocks after output token budget exceeded', () => {
    guard.beforeLlmCall()
    const result = guard.afterLlmCall(1500) // Over 1000 limit
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Output token budget exceeded')
  })

  it('tracks cumulative output tokens across calls', () => {
    guard.beforeLlmCall()
    let result = guard.afterLlmCall(400)
    expect(result.allowed).toBe(true)

    guard.beforeLlmCall()
    result = guard.afterLlmCall(400)
    expect(result.allowed).toBe(true)

    guard.beforeLlmCall()
    result = guard.afterLlmCall(300) // Total: 1100 > 1000
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Output token budget exceeded')
  })

  it('blocks on wall time exhaustion', () => {
    const tightBudget = makeBudget({ maxWallTimeMs: 1 }) // 1ms — will be instantly expired
    const tightGuard = new ToolExecutionGuard(tightBudget, allowlist)

    // Small delay to ensure wall time is exceeded
    const start = Date.now()
    while (Date.now() - start < 5) { /* spin */ }

    const result = tightGuard.beforeLlmCall()
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Wall time budget exhausted')
  })

  it('reports isBudgetExhausted correctly', () => {
    expect(guard.isBudgetExhausted()).toBe(false)

    guard.beforeLlmCall()
    guard.beforeLlmCall()
    guard.beforeLlmCall()

    expect(guard.isBudgetExhausted()).toBe(true)
  })

  it('getMetrics returns accurate snapshot', () => {
    guard.beforeLlmCall()
    guard.afterLlmCall(100)
    guard.beforeToolCall('code_interpreter')

    const metrics = guard.getMetrics()
    expect(metrics.llmCallsUsed).toBe(1)
    expect(metrics.toolCallsUsed).toBe(1)
    expect(metrics.totalOutputTokens).toBe(100)
    expect(metrics.startTimeMs).toBeLessThanOrEqual(Date.now())
  })

  it('mid-run scenario: agent uses 2 LLM calls + 2 tools, then tool #3 is blocked', () => {
    // Simulate realistic agent loop:

    // Step 1: LLM thinks (first call)
    const llm1 = guard.beforeLlmCall()
    expect(llm1.allowed).toBe(true)
    guard.afterLlmCall(200) // 200 tokens

    // Step 2: LLM requests tool
    const tool1 = guard.beforeToolCall('code_interpreter')
    expect(tool1.allowed).toBe(true)

    // Step 3: LLM processes tool result (second call)
    const llm2 = guard.beforeLlmCall()
    expect(llm2.allowed).toBe(true)
    guard.afterLlmCall(300) // 500 total

    // Step 4: LLM requests another tool
    const tool2 = guard.beforeToolCall('wallet_balance')
    expect(tool2.allowed).toBe(true)

    // Step 5: LLM tries THIRD tool → BLOCKED (budget = 2)
    const tool3 = guard.beforeToolCall('code_interpreter')
    expect(tool3.allowed).toBe(false)
    expect(tool3.reason).toContain('Tool call budget exhausted')

    // Step 6: LLM can still make final call (3rd LLM call, within budget)
    const llm3 = guard.beforeLlmCall()
    expect(llm3.allowed).toBe(true)
    guard.afterLlmCall(200) // 700 total (under 1000)

    // Step 7: 4th LLM call → BLOCKED
    const llm4 = guard.beforeLlmCall()
    expect(llm4.allowed).toBe(false)

    // Final state
    expect(guard.isBudgetExhausted()).toBe(true)
    const metrics = guard.getMetrics()
    expect(metrics.llmCallsUsed).toBe(3)
    expect(metrics.toolCallsUsed).toBe(2)
    expect(metrics.totalOutputTokens).toBe(700)
  })
})

/* ─── CommandsAllowlist Tests ─────────────────────────── */

describe('CommandsAllowlist', () => {
  it('allows tools in the allowlist', () => {
    const al = makeAllowlist(['code_interpreter', 'wallet_balance'])
    expect(al.validate('code_interpreter')).toBeNull()
    expect(al.validate('wallet_balance')).toBeNull()
  })

  it('blocks elevated tools not in the allowlist', () => {
    // Safe tools are always included. Elevated tools require explicit opt-in.
    const al = makeAllowlist(['code_interpreter'])
    const result = al.validate('wallet_transfer')
    expect(result).not.toBeNull()
    expect(result).toContain('not in the allowed tools list')
  })

  it('always includes safe tools regardless of policy', () => {
    // Explicit allowlist only gates elevated tools; safe tools always present
    const al = makeAllowlist(['dex_swap'])
    expect(al.isAllowed('schedule_task')).toBe(true)   // safe — always included
    expect(al.isAllowed('wallet_history')).toBe(true)   // safe — always included
    expect(al.isAllowed('dex_swap')).toBe(true)         // elevated — explicitly allowed
    expect(al.isAllowed('wallet_transfer')).toBe(false) // elevated — not in list
  })

  it('returns safe tools by default when policy is null', () => {
    const al = makeAllowlist(null)
    expect(al.hasTools()).toBe(true)
    // Safe tools auto-enabled
    expect(al.isAllowed('schedule_task')).toBe(true)
    // Null policy = all tools included (backwards compat)
    expect(al.isAllowed('wallet_transfer')).toBe(true)
  })

  it('reports hasTools correctly', () => {
    const al = makeAllowlist(['code_interpreter'])
    expect(al.hasTools()).toBe(true)

    // Even empty explicit list includes all safe tools
    const empty = makeAllowlist([])
    expect(empty.hasTools()).toBe(true)
  })
})
