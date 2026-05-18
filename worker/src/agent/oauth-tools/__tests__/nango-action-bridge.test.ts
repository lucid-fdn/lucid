import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Nango client — bypass config validation entirely
const mockTriggerAction = vi.fn().mockResolvedValue({ ok: true, message: 'sent' })
vi.mock('../nango-client.js', () => ({
  getNangoClient: () => ({ triggerAction: mockTriggerAction }),
  isNangoConfigured: () => true,
}))

// Mock tracing
vi.mock('../../../observability/tracing.js', () => ({
  withSpan: (_name: string, _attrs: unknown, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() }),
}))

// Mock Sentry
vi.mock('../../../monitoring/sentry.js', () => ({
  captureError: vi.fn(),
}))

// Mock rate limiter
const mockGetCallCount = vi.fn().mockResolvedValue(0)
const mockIncrementCallCount = vi.fn().mockResolvedValue(1)
vi.mock('../rate-limiter.js', () => ({
  getCallCount: (...args: unknown[]) => mockGetCallCount(...args),
  incrementCallCount: (...args: unknown[]) => mockIncrementCallCount(...args),
}))

// Mock audit
const mockEmitAudit = vi.fn()
vi.mock('../audit.js', () => ({
  emitOAuthToolAudit: (...args: unknown[]) => mockEmitAudit(...args),
  setAuditRpcFn: vi.fn(),
}))

// Mock action script loader
const mockLoadActionScript = vi.fn().mockReturnValue(null)
vi.mock('../action-script-loader.js', () => ({
  loadActionScript: (...args: unknown[]) => mockLoadActionScript(...args),
}))

// Mock proxy adapter
const mockCreateAdapter = vi.fn()
vi.mock('../nango-proxy-adapter.js', () => ({
  createNangoProxyAdapter: (...args: unknown[]) => mockCreateAdapter(...args),
}))

import { executeNangoAction, enforceResourceScope, type NangoActionContext } from '../nango-action-bridge.js'
import type { OAuthBinding } from '../types.js'

function makeBinding(overrides: Partial<OAuthBinding> = {}): OAuthBinding {
  return {
    assistantId: 'ast-123',
    provider: 'slack',
    connectionId: 'conn-abc',
    integrationId: 'slack',
    enabledActions: [],
    requiresConfirmationActions: [],
    maxCallsPerRun: 50,
    allowedResources: {},
    metadata: {},
    ...overrides,
  }
}

function makeCtx(overrides: Partial<NangoActionContext> = {}): NangoActionContext {
  return {
    binding: makeBinding(),
    runId: 'run-001',
    assistantId: 'ast-123',
    rpcFn: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
}

describe('executeNangoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCallCount.mockResolvedValue(0)
    mockLoadActionScript.mockReturnValue(null)
    // Restore the default success behavior — earlier tests may swap in
    // mockRejectedValue, and clearAllMocks() does not reset implementations.
    mockTriggerAction.mockResolvedValue({ ok: true, message: 'sent' })
  })

  it('executes action via triggerAction when no local script', async () => {
    const result = JSON.parse(await executeNangoAction('send-message', { channel: '#general' }, makeCtx()))
    expect(result).toEqual({ ok: true, message: 'sent' })
    expect(mockTriggerAction).toHaveBeenCalledWith('slack', 'conn-abc', 'send-message', { channel: '#general' })
    expect(mockIncrementCallCount).toHaveBeenCalledWith('run-001', 'slack')
  })

  it('executes action in-process when local script found', async () => {
    const mockExec = vi.fn().mockResolvedValue({ ok: true, in_process: true })
    mockLoadActionScript.mockReturnValue({ exec: mockExec })
    const fakeAdapter = { connectionId: 'conn-abc' }
    mockCreateAdapter.mockReturnValue(fakeAdapter)

    const result = JSON.parse(await executeNangoAction('send-message', { text: 'hi' }, makeCtx()))
    expect(result).toEqual({ ok: true, in_process: true })
    expect(mockExec).toHaveBeenCalledWith(fakeAdapter, { text: 'hi' })
    expect(mockCreateAdapter).toHaveBeenCalledWith('conn-abc', 'slack')
    expect(mockTriggerAction).not.toHaveBeenCalled()
  })

  it('uses the local Notion alias for script shaping while preserving the provider action name', async () => {
    const mockExec = vi.fn().mockResolvedValue({
      object: 'list',
      results: [],
      has_more: false,
      next_cursor: null,
    })
    mockLoadActionScript.mockReturnValue({ exec: mockExec })
    mockCreateAdapter.mockReturnValue({})

    await executeNangoAction(
      'search',
      {},
      makeCtx({
        binding: makeBinding({ provider: 'notion', integrationId: 'notion' }),
      }),
    )

    expect(mockLoadActionScript).toHaveBeenCalledWith('notion', 'search')
    expect(mockTriggerAction).not.toHaveBeenCalled()
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'search',
        status: 'success',
      }),
    )
  })

  it('falls back to triggerAction when loadActionScript returns null', async () => {
    mockLoadActionScript.mockReturnValue(null)
    await executeNangoAction('send-message', {}, makeCtx())
    expect(mockTriggerAction).toHaveBeenCalled()
  })

  it('uses the Notion local alias when falling back to triggerAction', async () => {
    mockLoadActionScript.mockReturnValue(null)

    const result = JSON.parse(
      await executeNangoAction(
        'search',
        { query: 'roadmap' },
        makeCtx({
          binding: makeBinding({ provider: 'notion', integrationId: 'notion' }),
        }),
      ),
    )

    expect(result).toEqual({ ok: true, message: 'sent' })
    expect(mockTriggerAction).toHaveBeenCalledWith('notion', 'conn-abc', 'search-pages', {
      query: 'roadmap',
      page_size: 10,
    })
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'search',
        status: 'success',
      }),
    )
  })

  it('enforces rate limit', async () => {
    mockGetCallCount.mockResolvedValue(50)
    const result = JSON.parse(await executeNangoAction('send-message', {}, makeCtx()))
    expect(result.error).toContain('Rate limit exceeded')
    expect(mockEmitAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }))
  })

  it('gates confirmation-required actions', async () => {
    const ctx = makeCtx({
      binding: makeBinding({ requiresConfirmationActions: ['send-message'] }),
    })
    const result = JSON.parse(await executeNangoAction('send-message', {}, ctx))
    expect(result.gated).toBe(true)
    expect(result.message).toContain('requires user confirmation')
    expect(mockEmitAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'gated' }))
  })

  it('emits audit on success', async () => {
    await executeNangoAction('send-message', { text: 'hi' }, makeCtx())
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        action: 'send-message',
        provider: 'slack',
      }),
    )
  })

  it('tracks usage via rpcFn on success', async () => {
    const rpcFn = vi.fn().mockResolvedValue({ error: null })
    await executeNangoAction('send-message', {}, makeCtx({ rpcFn }))
    await new Promise(r => setTimeout(r, 10))
    expect(rpcFn).toHaveBeenCalledWith('increment_oauth_usage', {
      p_connection_id: 'conn-abc',
      p_success: true,
    })
  })

  it('times out scripts that hang beyond 30s', async () => {
    const neverResolves = vi.fn().mockReturnValue(new Promise(() => {}))
    mockLoadActionScript.mockReturnValue({ exec: neverResolves })
    mockCreateAdapter.mockReturnValue({})

    // Override the 30s timeout to 50ms for test speed
    vi.useFakeTimers()
    const promise = executeNangoAction('send-message', {}, makeCtx())
    await vi.advanceTimersByTimeAsync(31_000)
    const result = JSON.parse(await promise)
    expect(result.error).toContain('timed out after 30s')
    vi.useRealTimers()
  })

  it('handles in-process script errors gracefully', async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error('Script crashed'))
    mockLoadActionScript.mockReturnValue({ exec: mockExec })
    mockCreateAdapter.mockReturnValue({})

    const result = JSON.parse(await executeNangoAction('send-message', {}, makeCtx()))
    expect(result.error).toBe('Script crashed')
    expect(mockEmitAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })

  it('emits audit with error on triggerAction failure', async () => {
    mockTriggerAction.mockRejectedValue(new Error('Nango timeout'))
    const result = JSON.parse(await executeNangoAction('send-message', {}, makeCtx()))
    expect(result.error).toBe('Nango timeout')
    expect(mockEmitAudit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorCode: 'execution_error' }),
    )
  })

  it('extracts nested provider errors and marks 403 connections unhealthy', async () => {
    const rpcFn = vi.fn().mockResolvedValue({ error: null })
    mockTriggerAction.mockRejectedValue({
      response: {
        status: 403,
        data: {
          code: 'restricted_resource',
          message: 'This integration is not shared with that page',
        },
      },
    })

    const result = JSON.parse(await executeNangoAction(
      'search',
      {},
      makeCtx({
        binding: makeBinding({ provider: 'notion', integrationId: 'notion' }),
        rpcFn,
      }),
    ))

    expect(result.status_code).toBe(403)
    expect(result.error_code).toBe('restricted_resource')
    expect(result.error).toContain('shared with the connected integration')

    await new Promise(r => setTimeout(r, 10))
    expect(rpcFn).toHaveBeenCalledWith('update_connection_health', {
      p_connection_id: 'conn-abc',
      p_status: 'error',
      p_error_code: 'restricted_resource',
      p_error_message: result.error,
    })
  })

  it('maps 401 Notion failures to reconnect guidance', async () => {
    mockTriggerAction.mockRejectedValue({
      response: {
        status: 401,
        data: {
          message: 'Unauthorized',
        },
      },
    })

    const result = JSON.parse(await executeNangoAction(
      'search',
      {},
      makeCtx({
        binding: makeBinding({ provider: 'notion', integrationId: 'notion' }),
      }),
    ))

    expect(result.status_code).toBe(401)
    expect(result.error).toContain('reconnect')
  })

  describe('resource scope enforcement (allowedResources)', () => {
    it('allows the call when arg value is in the allowlist', async () => {
      const ctx = makeCtx({
        binding: makeBinding({ allowedResources: { channel: ['#general', '#support'] } }),
      })
      const result = JSON.parse(await executeNangoAction('send-message', { channel: '#general', text: 'hi' }, ctx))
      expect(result.ok).toBe(true)
      expect(mockTriggerAction).toHaveBeenCalled()
    })

    it('denies the call when arg value is not in the allowlist', async () => {
      const ctx = makeCtx({
        binding: makeBinding({ allowedResources: { channel: ['#general'] } }),
      })
      const result = JSON.parse(
        await executeNangoAction('send-message', { channel: '#secret-finance', text: 'hi' }, ctx),
      )
      expect(result.error).toContain('not in the allowed list')
      expect(result.denied_resource).toBe('channel')
      expect(result.allowed_values).toEqual(['#general'])
      expect(mockTriggerAction).not.toHaveBeenCalled()
      expect(mockEmitAudit).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'denied', errorCode: 'resource_scope_denied' }),
      )
    })

    it('denies the call when a gated resource is missing from args entirely', async () => {
      const ctx = makeCtx({
        binding: makeBinding({ allowedResources: { channel: ['#general'] } }),
      })
      const result = JSON.parse(await executeNangoAction('send-message', { text: 'hi' }, ctx))
      expect(result.denied_resource).toBe('channel')
      expect(mockTriggerAction).not.toHaveBeenCalled()
    })

    it('honors a wildcard allowlist as an opt-out for that resource', async () => {
      const ctx = makeCtx({
        binding: makeBinding({ allowedResources: { channel: ['*'] } }),
      })
      const result = JSON.parse(await executeNangoAction('send-message', { channel: '#anything' }, ctx))
      expect(result.ok).toBe(true)
    })

    it('skips enforcement entirely when allowedResources is empty', async () => {
      const ctx = makeCtx({ binding: makeBinding({ allowedResources: {} }) })
      const result = JSON.parse(await executeNangoAction('send-message', { channel: '#anywhere' }, ctx))
      expect(result.ok).toBe(true)
      expect(mockTriggerAction).toHaveBeenCalled()
    })

    it('denies array args where any element is outside the allowlist', () => {
      const result = enforceResourceScope(
        { channels: ['#general', '#secret'] },
        { channels: ['#general', '#support'] },
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.value).toBe('#secret')
      }
    })
  })

  it('tracks usage via rpcFn on failure', async () => {
    mockTriggerAction.mockRejectedValue(new Error('fail'))
    const rpcFn = vi.fn().mockResolvedValue({ error: null })
    await executeNangoAction('send-message', {}, makeCtx({ rpcFn }))
    await new Promise(r => setTimeout(r, 10))
    expect(rpcFn).toHaveBeenCalledWith('increment_oauth_usage', {
      p_connection_id: 'conn-abc',
      p_success: false,
    })
  })
})
