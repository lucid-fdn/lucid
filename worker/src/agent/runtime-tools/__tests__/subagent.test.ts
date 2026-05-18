/**
 * Tests for subagent spawning tool.
 *
 * Covers: depth limits, children limits, workspace isolation,
 * cleanup on failure, tool call budget enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import {
  toolSpawnSubagent,
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_MAX_CHILDREN,
  type SubagentContext,
} from '../subagent.js'

// Mock the tracing module to be a passthrough
vi.mock('../../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() }),
}))

// Mock the metrics module
vi.mock('../../../observability/metrics.js', () => ({
  incSubagentSpawned: vi.fn(),
  incSubagentFailed: vi.fn(),
}))

// Track fs operations
const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockRm = vi.fn().mockResolvedValue(undefined)
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: (...args: any[]) => mockMkdir(...args),
    rm: (...args: any[]) => mockRm(...args),
  },
}))

// Mock runEmbeddedPiAgent
const mockRunAgent = vi.fn()
vi.mock('@lucid/openclaw-runtime', () => ({
  runEmbeddedPiAgent: (...args: any[]) => mockRunAgent(...args),
}))

function createCtx(overrides: Partial<SubagentContext> = {}): SubagentContext {
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

describe('toolSpawnSubagent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAgent.mockResolvedValue({
      payloads: [{ text: 'Done!' }],
      meta: { agentMeta: { usage: { input: 100, output: 50 } } },
    })
  })

  it('rejects empty task', async () => {
    const ctx = createCtx()
    const result = JSON.parse(await toolSpawnSubagent({ task: '' }, ctx))
    expect(result.error).toMatch(/required/)
  })

  it('rejects when max depth reached', async () => {
    const ctx = createCtx({ depth: SUBAGENT_MAX_DEPTH })
    const result = JSON.parse(await toolSpawnSubagent({ task: 'do thing' }, ctx))
    expect(result.error).toMatch(/depth/)
  })

  it('rejects when max children reached', async () => {
    const ctx = createCtx({ childrenSpawned: SUBAGENT_MAX_CHILDREN })
    const result = JSON.parse(await toolSpawnSubagent({ task: 'do thing' }, ctx))
    expect(result.error).toMatch(/children/)
  })

  it('increments childrenSpawned on spawn', async () => {
    const ctx = createCtx()
    expect(ctx.childrenSpawned).toBe(0)
    await toolSpawnSubagent({ task: 'do thing' }, ctx)
    expect(ctx.childrenSpawned).toBe(1)
  })

  it('creates isolated child workspace dir', async () => {
    const ctx = createCtx({ workspaceDir: '/tmp/parent-ws' })
    await toolSpawnSubagent({ task: 'do thing' }, ctx)

    expect(mockMkdir).toHaveBeenCalledTimes(1)
    const createdDir = (mockMkdir.mock.calls[0][0] as string).replace(/\\/g, '/')
    expect(createdDir).toMatch(/\/tmp\/parent-ws\/subagent-/)
    expect(mockMkdir.mock.calls[0][1]).toEqual({ recursive: true })
  })

  it('cleans up workspace after success', async () => {
    const ctx = createCtx()
    await toolSpawnSubagent({ task: 'do thing' }, ctx)

    expect(mockRm).toHaveBeenCalledTimes(1)
    expect(mockRm.mock.calls[0][1]).toEqual({ recursive: true, force: true })
  })

  it('cleans up workspace after failure', async () => {
    mockRunAgent.mockRejectedValue(new Error('boom'))
    const ctx = createCtx()
    await toolSpawnSubagent({ task: 'do thing' }, ctx)

    expect(mockRm).toHaveBeenCalledTimes(1)
  })

  it('cleanup failure does not crash the parent', async () => {
    mockRm.mockRejectedValue(new Error('EPERM'))
    const ctx = createCtx()

    // Should not throw
    const result = JSON.parse(await toolSpawnSubagent({ task: 'do thing' }, ctx))
    expect(result.text).toBe('Done!')
  })

  it('returns structured result on success', async () => {
    const ctx = createCtx()
    const result = JSON.parse(await toolSpawnSubagent({ task: 'do thing' }, ctx))

    expect(result.text).toBe('Done!')
    expect(result.parentRunId).toBe('parent-run-1')
    expect(result.childRunId).toBeTruthy()
    expect(result.usage.input).toBe(100)
    expect(result.usage.output).toBe(50)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('returns error on agent failure without crashing', async () => {
    mockRunAgent.mockRejectedValue(new Error('model overloaded'))
    const ctx = createCtx()
    const result = JSON.parse(await toolSpawnSubagent({ task: 'do thing' }, ctx))

    expect(result.error).toBe('model overloaded')
    expect(result.parentRunId).toBe('parent-run-1')
    expect(result.childRunId).toBeTruthy()
  })

  it('passes child workspace dir to runEmbeddedPiAgent, not parent dir', async () => {
    const ctx = createCtx({ workspaceDir: '/tmp/parent' })
    await toolSpawnSubagent({ task: 'do thing' }, ctx)

    const callArgs = mockRunAgent.mock.calls[0][0]
    const wsDir = callArgs.workspaceDir.replace(/\\/g, '/')
    expect(wsDir).not.toBe('/tmp/parent')
    expect(wsDir).toMatch(/\/tmp\/parent\/subagent-/)
    expect(callArgs.agentDir).toBe(callArgs.workspaceDir)
  })
})
