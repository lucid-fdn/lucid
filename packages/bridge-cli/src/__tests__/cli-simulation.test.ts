/**
 * CLI Simulation — Production scenario tests for bridge CLI.
 *
 * Simulates real-world conditions: slow responses, malformed data,
 * edge cases in formatting, concurrent operations, env file parsing,
 * and connection polling state machines.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import {
  resolveAuthContext,
  createRuntime,
  listRuntimes,
  getRuntime,
  pollUntilConnected,
  buildEnvFileContent,
  isOk,
  isErr,
} from '../cli/api.js'
import { resolveCliAuth } from '../cli/auth.js'
import { envCommand } from '../cli/commands.js'

// =============================================================================
// Mock HTTP Boundary
// =============================================================================

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  delete process.env.LUCID_TOKEN
  delete process.env.LUCID_CONTROL_PLANE_URL
  delete process.env.LUCID_CONFIG_DIR
  delete process.env.LUCID_CREDENTIALS_FILE
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ 'content-type': 'application/json' }),
  })
}

// =============================================================================
// Connection Polling State Machine
// =============================================================================

describe('connection polling state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('transitions pending → stale → connected', async () => {
    let pollCount = 0
    mockFetch.mockImplementation(() => {
      pollCount++
      const status = pollCount <= 2 ? 'pending' : pollCount <= 4 ? 'stale' : 'connected'
      return jsonResponse({
        runtimes: [{ id: 'rt-1', status, provider: 'manual' }],
      })
    })

    const promise = pollUntilConnected({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-1',
    })

    // Advance through polling intervals (2s initial, backs off)
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3_000)
    }

    const result = await promise
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.runtime.status).toBe('connected')
    }
  })

  it('returns error on timeout after 5 minutes', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({ runtimes: [{ id: 'rt-1', status: 'pending', provider: 'manual' }] }),
    )

    const promise = pollUntilConnected({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-1',
    })

    // Advance 6 minutes
    for (let i = 0; i < 360; i++) {
      await vi.advanceTimersByTimeAsync(1_000)
    }

    const result = await promise
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('Timed out')
    }
  })

  it('respects abort signal', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({ runtimes: [{ id: 'rt-1', status: 'pending', provider: 'manual' }] }),
    )

    const controller = new AbortController()

    const promise = pollUntilConnected({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-1',
      signal: controller.signal,
    })

    // Let a few polls happen then abort
    await vi.advanceTimersByTimeAsync(3_000)
    controller.abort()
    await vi.advanceTimersByTimeAsync(3_000)

    const result = await promise
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('Cancelled')
    }
  }, 10_000)

  it('onPoll callback receives elapsed time', async () => {
    let pollCount = 0
    mockFetch.mockImplementation(() => {
      pollCount++
      return jsonResponse({
        runtimes: [{ id: 'rt-1', status: pollCount >= 3 ? 'connected' : 'pending', provider: 'manual' }],
      })
    })

    const elapsedValues: number[] = []

    const promise = pollUntilConnected({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-1',
      onPoll: (elapsed) => elapsedValues.push(elapsed),
    })

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3_000)
    }

    await promise

    // Should have received increasing elapsed values
    expect(elapsedValues.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < elapsedValues.length; i++) {
      expect(elapsedValues[i]).toBeGreaterThanOrEqual(elapsedValues[i - 1])
    }
  })
})

// =============================================================================
// Env File Content Generation
// =============================================================================

describe('env file content generation', () => {
  it('generates valid env file with all fields', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-gen',
      apiKey: 'key-gen-123',
      controlPlaneUrl: 'https://lucid.foundation',
      displayName: 'my-agent',
      mode: 'full',
    })

    expect(content).toContain('LUCID_RUNTIME_ID=rt-gen')
    expect(content).toContain('LUCID_RUNTIME_KEY=key-gen-123')
    expect(content).toContain('LUCID_CONTROL_PLANE_URL=https://lucid.foundation')
    expect(content).toContain('# Mode: full')
    expect(content).toContain('# Runtime: my-agent')
  })

  it('defaults mode to full when not specified', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-1',
      apiKey: 'k',
      controlPlaneUrl: 'https://x',
      displayName: 'test',
    })

    expect(content).toContain('# Mode: full')
  })

  it('includes observe mode when specified', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-1',
      apiKey: 'k',
      controlPlaneUrl: 'https://x',
      displayName: 'test',
      mode: 'observe',
    })

    expect(content).toContain('# Mode: observe')
  })

  it('handles special characters in display name', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-1',
      apiKey: 'k',
      controlPlaneUrl: 'https://x',
      displayName: 'My Agent (prod) v2.1 — "primary"',
    })

    expect(content).toContain('My Agent (prod) v2.1')
  })
})

// =============================================================================
// Env File Parsing Edge Cases
// =============================================================================

describe('env file parsing edge cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })
  })

  it('handles env file with Windows line endings (CRLF)', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'LUCID_RUNTIME_ID=rt-crlf\r\nLUCID_RUNTIME_KEY=key-with-crlf-padding1234\r\nLUCID_CONTROL_PLANE_URL=https://x\r\n',
    )

    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))

    await envCommand('/tmp/test.env')

    const output = logCalls.join('\n')
    expect(output).toContain('LUCID_RUNTIME_ID=rt-crlf')
  })

  it('handles env file with values containing equals signs', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'LUCID_RUNTIME_ID=rt-eq\nLUCID_RUNTIME_KEY=key=with=equals=signs\nLUCID_CONTROL_PLANE_URL=https://x\n',
    )

    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))

    await envCommand('/tmp/test.env')

    const output = logCalls.join('\n')
    expect(output).toContain('LUCID_RUNTIME_ID=rt-eq')
    // Key value should include the equals signs after the first one
    expect(output).toContain('LUCID_RUNTIME_KEY=')
  })

  it('handles env file with empty lines and multiple comments', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      [
        '# Comment 1',
        '# Comment 2',
        '',
        '',
        'LUCID_RUNTIME_ID=rt-gaps',
        '',
        '# Middle comment',
        'LUCID_RUNTIME_KEY=shortkey1',
        '',
        'LUCID_CONTROL_PLANE_URL=https://x',
        '',
        '',
      ].join('\n'),
    )

    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))

    await envCommand('/tmp/test.env')

    const output = logCalls.join('\n')
    expect(output).toContain('LUCID_RUNTIME_ID=rt-gaps')
  })

  it('handles env file with whitespace around keys', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '  LUCID_RUNTIME_ID=rt-ws  \n  LUCID_RUNTIME_KEY=key123456789012345  \n  LUCID_CONTROL_PLANE_URL=https://x  \n',
    )

    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))

    await envCommand('/tmp/test.env')

    const output = logCalls.join('\n')
    expect(output).toContain('LUCID_RUNTIME_ID=rt-ws')
  })
})

// =============================================================================
// Auth Resolution Edge Cases
// =============================================================================

describe('auth resolution edge cases', () => {
  it('returns null when no credentials exist anywhere', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const auth = resolveCliAuth()
    expect(auth).toBeNull()
  })

  it('reads from custom LUCID_CREDENTIALS_FILE', () => {
    process.env.LUCID_CREDENTIALS_FILE = '/custom/path/creds.json'
    vi.spyOn(fs, 'existsSync').mockImplementation((p) =>
      (p as string) === '/custom/path/creds.json',
    )
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ lucid: { token: 'custom-tok', api_url: 'https://custom.test' } }),
    )

    const auth = resolveCliAuth()
    expect(auth).not.toBeNull()
    expect(auth!.token).toBe('custom-tok')
    expect(auth!.controlPlaneUrl).toBe('https://custom.test')
  })

  it('env var token works without any credentials file', () => {
    process.env.LUCID_TOKEN = 'env-only-token'
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const auth = resolveCliAuth()
    expect(auth).not.toBeNull()
    expect(auth!.token).toBe('env-only-token')
    expect(auth!.controlPlaneUrl).toBe('https://lucid.foundation')
  })

  it('flag token works even with empty env', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const auth = resolveCliAuth({ token: 'flag-tok', url: 'https://flag.test' })
    expect(auth).not.toBeNull()
    expect(auth!.token).toBe('flag-tok')
    expect(auth!.controlPlaneUrl).toBe('https://flag.test')
  })
})

// =============================================================================
// API Function Resilience
// =============================================================================

describe('API function resilience', () => {
  it('resolveAuthContext handles org endpoint returning non-array', async () => {
    // Some APIs return { organizations: [...] } instead of [...]
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ organizations: [{ id: 'org-nested' }] }),
    )

    const result = await resolveAuthContext('tok', 'https://lucid.test')
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.orgId).toBe('org-nested')
    }
  })

  it('createRuntime includes all required fields in request', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-1' }, apiKey: 'k' }),
    )

    await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'test',
      engine: 'openclaw',
      channelMode: 'relay',
    })

    const call = mockFetch.mock.calls[0]
    const url = call[0] as string
    const opts = call[1] as RequestInit
    const body = JSON.parse(opts.body as string)

    // URL has org_id query param
    expect(url).toContain('org_id=org-1')

    // Body has required fields
    expect(body.displayName).toBe('test')
    expect(body.provider).toBe('manual')
    expect(body.runtimeTier).toBe('byo')
    expect(body.channelMode).toBe('relay')

    // Headers correct
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('getRuntime returns error for missing runtime', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtimes: [{ id: 'rt-other', status: 'connected', provider: 'manual' }] }),
    )

    const result = await getRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-missing',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('not found')
    }
  })

  it('listRuntimes handles both array and object response formats', async () => {
    // Test array format
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ id: 'rt-1', status: 'connected', provider: 'manual' }]),
    )

    const result1 = await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
    })

    expect(isOk(result1)).toBe(true)
    if (isOk(result1)) {
      expect(result1.runtimes).toHaveLength(1)
    }

    // Test object format
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtimes: [{ id: 'rt-2', status: 'pending', provider: 'manual' }] }),
    )

    const result2 = await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
    })

    expect(isOk(result2)).toBe(true)
    if (isOk(result2)) {
      expect(result2.runtimes).toHaveLength(1)
    }
  })
})

// =============================================================================
// Type Guard Correctness
// =============================================================================

describe('type guard correctness', () => {
  it('isOk returns true for success results', () => {
    expect(isOk({ ok: true as const, data: 'test' })).toBe(true)
  })

  it('isOk returns false for error results', () => {
    expect(isOk({ ok: false as const, error: 'fail' })).toBe(false)
  })

  it('isErr returns true for error results', () => {
    expect(isErr({ ok: false as const, error: 'fail' })).toBe(true)
  })

  it('isErr returns false for success results', () => {
    expect(isErr({ ok: true as const, data: 'test' })).toBe(false)
  })

  it('type guards work with all CliResult variations', () => {
    const success = { ok: true as const, runtimes: [] }
    const error = { ok: false as const, error: 'msg', hint: 'try this' }

    if (isOk(success)) {
      expect(success.runtimes).toBeDefined()
    }
    if (isErr(error)) {
      expect(error.hint).toBe('try this')
    }
  })
})

// =============================================================================
// Security: Request Headers
// =============================================================================

describe('security: request headers', () => {
  it('all API requests include Authorization header', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ runtimes: [{ id: 'rt-1', status: 'connected', provider: 'manual' }] }),
    )

    await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'secret-tok',
      orgId: 'org-1',
    })

    for (const call of mockFetch.mock.calls) {
      const opts = call[1] as RequestInit
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer secret-tok')
    }
  })

  it('createRuntime uses POST method (never GET for mutations)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-1' }, apiKey: 'k' }),
    )

    await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'test',
      engine: 'openclaw',
      channelMode: 'relay',
    })

    const call = mockFetch.mock.calls[0]
    expect((call[1] as RequestInit).method).toBe('POST')
  })

  it('listRuntimes uses GET method (no body)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ runtimes: [] }))

    await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
    })

    const call = mockFetch.mock.calls[0]
    expect((call[1] as RequestInit).method ?? 'GET').toBe('GET')
    expect((call[1] as RequestInit).body).toBeUndefined()
  })
})
