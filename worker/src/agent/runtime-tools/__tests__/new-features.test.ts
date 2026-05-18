/**
 * Tests for newly added OpenClaw parity features:
 * - Messaging: label/name lookup
 * - Scheduler: webhook_url delivery
 * - Subagent: model override
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// MESSAGING — Label Lookup
// =============================================================================

import { toolSendMessageToAgent, type MessagingContext } from '../messaging.js'

vi.mock('../../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() }),
}))

const mockIncEnqueued = vi.fn()
const mockIncRejected = vi.fn()
vi.mock('../../../observability/metrics.js', () => ({
  incMessagesEnqueued: (...args: any[]) => mockIncEnqueued(...args),
  incMessagesRejected: (...args: any[]) => mockIncRejected(...args),
  incSubagentSpawned: vi.fn(),
  incSubagentFailed: vi.fn(),
}))

const mockTryConsume = vi.fn().mockResolvedValue({ allowed: true, remaining: 10 })
vi.mock('../../../guards/TenantRateLimiter.js', () => ({
  TenantRateLimiter: vi.fn().mockImplementation(() => ({
    tryConsume: mockTryConsume,
  })),
}))

function createMessagingSb(opts: {
  lookupById?: { id: string; name: string; org_id: string } | null
  lookupByName?: { id: string; name: string; org_id: string } | null
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'ai_assistants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: opts.lookupById ?? { id: 'target-222', name: 'TargetBot', org_id: 'org-aaa' },
            error: opts.lookupById === null ? { message: 'not found' } : null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: opts.lookupByName ?? null,
            error: null,
          }),
        }
      }
      if (table === 'assistant_channels') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'ch-1' }, error: null }),
        }
      }
      if (table === 'assistant_inbound_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn(() => ({ error: null })),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    }),
  } as any
}

function msgCtx(sb: any, extra: Partial<MessagingContext> = {}): MessagingContext {
  return {
    supabase: sb,
    sourceAssistantId: 'source-111',
    sourceAssistantName: 'SourceBot',
    orgId: 'org-aaa',
    parentRunId: 'run-xyz',
    toolCallId: 'tc-1',
    ...extra,
  }
}

describe('messaging — label/name lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('resolves target by name when target_assistant_id not provided', async () => {
    const sb = createMessagingSb({
      lookupByName: { id: 'target-by-name', name: 'ResearchBot', org_id: 'org-aaa' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_name: 'ResearchBot', message: 'hello' },
        msgCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.target_assistant.name).toBe('ResearchBot')
  })

  it('rejects when neither target_assistant_id nor target_name provided', async () => {
    const sb = createMessagingSb()
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { message: 'hello' },
        msgCtx(sb),
      ),
    )
    expect(result.error).toMatch(/target_assistant_id.*target_name/i)
  })

  it('rejects self-send via name lookup', async () => {
    const sb = createMessagingSb({
      lookupByName: { id: 'source-111', name: 'SourceBot', org_id: 'org-aaa' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_name: 'SourceBot', message: 'hi self' },
        msgCtx(sb),
      ),
    )
    expect(result.error).toMatch(/yourself/)
  })

  it('returns not found when name has no match', async () => {
    const sb = createMessagingSb({ lookupByName: null })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_name: 'NonExistentBot', message: 'hello' },
        msgCtx(sb),
      ),
    )
    expect(result.error).toMatch(/not found/)
  })

  it('prefers target_assistant_id over target_name when both provided', async () => {
    const sb = createMessagingSb({
      lookupById: { id: 'target-by-id', name: 'IDBot', org_id: 'org-aaa' },
      lookupByName: { id: 'target-by-name', name: 'NameBot', org_id: 'org-aaa' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-by-id', target_name: 'NameBot', message: 'hello' },
        msgCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.target_assistant.name).toBe('IDBot')
  })
})

// =============================================================================
// SCHEDULER — Webhook URL
// =============================================================================

import { toolScheduleTask, type SchedulerContext } from '../scheduler.js'

function createSchedulerSb() {
  const chain: any = {
    insert: vi.fn(() => ({ error: null })),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    update: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  }
  return { from: vi.fn(() => chain) } as any
}

function schedCtx(sb: any): SchedulerContext {
  return {
    supabase: sb,
    assistantId: 'asst-wh-test',
    orgId: 'org-wh-test',
    parentRunId: `run-wh-${Date.now()}-${Math.random()}`,
  }
}

describe('scheduler — webhook_url', () => {
  it('accepts valid HTTPS webhook URL', async () => {
    const sb = createSchedulerSb()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'webhook-task',
          task_prompt: 'test',
          cron_expression: '*/5 * * * *',
          webhook_url: 'https://example.com/webhook',
        },
        schedCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })

  it('rejects HTTP (non-HTTPS) webhook URL', async () => {
    const sb = createSchedulerSb()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'http-webhook',
          task_prompt: 'test',
          cron_expression: '*/5 * * * *',
          webhook_url: 'http://example.com/webhook',
        },
        schedCtx(sb),
      ),
    )
    expect(result.error).toMatch(/HTTPS/)
  })

  it('rejects invalid webhook URL', async () => {
    const sb = createSchedulerSb()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'bad-url',
          task_prompt: 'test',
          cron_expression: '*/5 * * * *',
          webhook_url: 'not-a-url',
        },
        schedCtx(sb),
      ),
    )
    expect(result.error).toMatch(/valid URL/)
  })

  it('allows task without webhook URL (optional)', async () => {
    const sb = createSchedulerSb()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'no-webhook', task_prompt: 'test', cron_expression: '*/5 * * * *' },
        schedCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// SUBAGENT — Model Override
// =============================================================================

import { toolSpawnSubagent, type SubagentContext } from '../subagent.js'

const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockRm = vi.fn().mockResolvedValue(undefined)
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: (...args: any[]) => mockMkdir(...args),
    rm: (...args: any[]) => mockRm(...args),
  },
}))

const mockRunAgent = vi.fn()
vi.mock('@lucid/openclaw-runtime', () => ({
  runEmbeddedPiAgent: (...args: any[]) => mockRunAgent(...args),
}))

function subCtx(overrides: Partial<SubagentContext> = {}): SubagentContext {
  return {
    parentRunId: 'parent-run-1',
    depth: 0,
    childrenSpawned: 0,
    totalChildToolCalls: 0,
    sessionFile: '/tmp/test/session.json',
    workspaceDir: '/tmp/test/workspace',
    provider: 'openai',
    model: 'gpt-4',
    config: {},
    temperature: 0.7,
    maxOutputTokens: 4096,
    ...overrides,
  }
}

describe('subagent — model override', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAgent.mockResolvedValue({
      payloads: [{ text: 'Done!' }],
      meta: { agentMeta: { usage: { input: 100, output: 50 } } },
    })
  })

  it('uses parent model when no override specified', async () => {
    const ctx = subCtx({ model: 'gpt-4' })
    await toolSpawnSubagent({ task: 'do thing' }, ctx)

    const callArgs = mockRunAgent.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4')
  })

  it('uses override model when specified', async () => {
    const ctx = subCtx({ model: 'gpt-4' })
    await toolSpawnSubagent({ task: 'do thing', model: 'gpt-4o-mini' }, ctx)

    const callArgs = mockRunAgent.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4o-mini')
  })

  it('uses override model in v2 runtime path', async () => {
    const mockRunTurn = vi.fn().mockResolvedValue({
      text: 'V2 done',
      toolCallsUsed: 1,
      meta: { usage: { input: 10, output: 5 } },
    })

    const ctx = subCtx({ runTurn: mockRunTurn, model: 'gpt-4' })
    await toolSpawnSubagent({ task: 'v2 task', model: 'claude-3-haiku' }, ctx)

    const callArgs = mockRunTurn.mock.calls[0][0]
    expect(callArgs.assistant.lucid_model).toBe('claude-3-haiku')
  })

  it('falls back to parent model when override is empty', async () => {
    const ctx = subCtx({ model: 'gpt-4' })
    await toolSpawnSubagent({ task: 'do thing', model: '' }, ctx)

    const callArgs = mockRunAgent.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-4')
  })
})
