/**
 * CLI E2E — Full pipeline tests for bridge CLI commands.
 *
 * Tests complete flows: auth → API → command output, including error paths,
 * network failures, HTTP error codes, and multi-command sequences.
 *
 * Mock strategy: stub global fetch (only external boundary).
 * Real: auth resolution, API functions, command I/O.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import {
  initCommand,
  statusCommand,
  listCommand,
  envCommand,
} from '../cli/commands.js'

// =============================================================================
// Mock HTTP Boundary
// =============================================================================

const mockFetch = vi.fn()
let consoleLogCalls: string[] = []
let consoleErrorCalls: string[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  consoleLogCalls = []
  consoleErrorCalls = []

  vi.spyOn(console, 'log').mockImplementation((...args) => {
    consoleLogCalls.push(args.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    consoleErrorCalls.push(args.map(String).join(' '))
  })
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit:${code}`)
  })

  // Default: authenticated with token + org
  process.env.LUCID_TOKEN = 'test-token'
  delete process.env.LUCID_CONTROL_PLANE_URL
  delete process.env.LUCID_CONFIG_DIR
  delete process.env.LUCID_CREDENTIALS_FILE
  vi.spyOn(fs, 'existsSync').mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.LUCID_TOKEN
})

// =============================================================================
// Helpers
// =============================================================================

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ 'content-type': 'application/json' }),
  })
}

function withOrg() {
  mockFetch.mockResolvedValueOnce(jsonResponse([{ id: 'org-1' }]))
}

// =============================================================================
// Full Pipeline: init → status → list → env
// =============================================================================

describe('full pipeline e2e', () => {
  it('init creates runtime, then status reads it, then list shows it', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    const runtime = {
      id: 'rt-pipeline',
      display_name: 'pipeline-agent',
      status: 'pending',
      provider: 'manual',
      runtime_tier: 'byo',
    }

    // Step 1: init
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-pipeline' }, apiKey: 'key-pipeline-123456789' }),
    )
    const mockWrite = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'pipeline-agent', json: true, output: '/tmp/pipeline.env' })

    const initOutput = consoleLogCalls.find((l) => l.includes('runtimeId'))
    expect(initOutput).toBeDefined()
    const initParsed = JSON.parse(initOutput!)
    expect(initParsed.runtimeId).toBe('rt-pipeline')
    expect(initParsed.apiKey).toBe('key-pipeline-123456789')

    // Step 2: status (runtime is now 'connected' after heartbeat)
    consoleLogCalls = []
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [{ ...runtime, status: 'connected', cpu_percent: 25, ram_percent: 40 }],
      }),
    )

    await statusCommand('rt-pipeline')

    const statusOutput = consoleLogCalls.join('\n')
    expect(statusOutput).toContain('pipeline-agent')
    expect(statusOutput).toContain('connected')
    expect(statusOutput).toContain('25%')

    // Step 3: list
    consoleLogCalls = []
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          { ...runtime, status: 'connected' },
          { id: 'rt-other', display_name: 'other-agent', status: 'offline', provider: 'manual', runtime_tier: 'byo' },
        ],
      }),
    )

    await listCommand()

    const listOutput = consoleLogCalls.join('\n')
    expect(listOutput).toContain('pipeline-agent')
    expect(listOutput).toContain('other-agent')

    mockWrite.mockRestore()
  })
})

// =============================================================================
// HTTP Error Code Handling
// =============================================================================

describe('HTTP error code handling', () => {
  const errorCases = [
    { status: 401, label: 'Unauthorized' },
    { status: 403, label: 'Forbidden' },
    { status: 404, label: 'Not Found' },
    { status: 500, label: 'Internal Server Error' },
    { status: 502, label: 'Bad Gateway' },
    { status: 503, label: 'Service Unavailable' },
    { status: 429, label: 'Rate Limited' },
  ]

  for (const { status, label } of errorCases) {
    it(`init handles HTTP ${status} (${label}) from runtime creation`, async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      withOrg()
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status,
          text: () => Promise.resolve(`${label}`),
          headers: new Headers(),
        }),
      )

      await expect(initCommand({ name: 'test' })).rejects.toThrow('exit:1')
      expect(consoleErrorCalls.join('\n')).toContain(`HTTP ${status}`)
    })
  }

  it('status handles HTTP 500 from runtime list', async () => {
    withOrg()
    mockFetch.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
        headers: new Headers(),
      }),
    )

    await expect(statusCommand('rt-123')).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('HTTP 500')
  })
})

// =============================================================================
// Network Failure During Commands
// =============================================================================

describe('network failure during commands', () => {
  it('init reports network error when fetch throws', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    withOrg()
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(initCommand({ name: 'test' })).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Network error')
  })

  it('list reports network error when fetch throws', async () => {
    // Org resolution succeeds but list fails
    withOrg()
    mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'))

    await expect(listCommand()).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Network error')
  })

  it('status reports network error when fetch throws', async () => {
    withOrg()
    mockFetch.mockRejectedValueOnce(new Error('DNS_FAILED'))

    await expect(statusCommand('rt-123')).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Network error')
  })
})

// =============================================================================
// Org Resolution Failures
// =============================================================================

describe('org resolution failures', () => {
  it('fails when org endpoint returns empty array and token is not JWT', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]))

    await expect(listCommand()).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Could not resolve organization')
  })

  it('falls back to JWT extraction when org endpoint fails', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    // Encode a JWT with org_id in payload
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ org_id: 'jwt-org' })).toString('base64url')
    process.env.LUCID_TOKEN = `${header}.${payload}.fake-sig`

    // Org endpoint fails
    mockFetch.mockResolvedValueOnce(
      Promise.resolve({ ok: false, status: 500, json: async () => ({}), text: async () => '' }),
    )

    // Runtime creation succeeds
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-jwt' }, apiKey: 'k' }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'jwt-test', json: true })

    const output = consoleLogCalls.find((l) => l.includes('runtimeId'))
    expect(output).toBeDefined()
    expect(JSON.parse(output!).runtimeId).toBe('rt-jwt')

    // Verify the runtime creation used the JWT-extracted org
    const createCall = mockFetch.mock.calls.find(
      (c: unknown[]) => (c[1] as any)?.method === 'POST' && (c[0] as string).includes('/api/runtimes'),
    )
    expect(createCall).toBeDefined()
    expect((createCall![0] as string)).toContain('jwt-org')
  })
})

// =============================================================================
// Large Response Handling
// =============================================================================

describe('large response handling', () => {
  it('list handles 100+ runtimes without error', async () => {
    withOrg()

    const runtimes = Array.from({ length: 150 }, (_, i) => ({
      id: `rt-${i}`,
      display_name: `agent-${i}`,
      status: i % 3 === 0 ? 'connected' : i % 3 === 1 ? 'stale' : 'offline',
      provider: 'manual',
      runtime_tier: 'byo',
      last_seen_at: new Date(Date.now() - i * 60_000).toISOString(),
    }))

    mockFetch.mockResolvedValueOnce(jsonResponse({ runtimes }))

    await listCommand()

    const output = consoleLogCalls.join('\n')
    // Should contain first and last agents
    expect(output).toContain('agent-0')
    expect(output).toContain('agent-149')
  })

  it('list with --json outputs valid JSON for 100+ runtimes', async () => {
    withOrg()

    const runtimes = Array.from({ length: 100 }, (_, i) => ({
      id: `rt-${i}`,
      status: 'connected',
      provider: 'manual',
      runtime_tier: 'byo',
    }))

    mockFetch.mockResolvedValueOnce(jsonResponse({ runtimes }))

    await listCommand({ json: true })

    const parsed = JSON.parse(consoleLogCalls[0])
    expect(parsed).toHaveLength(100)
    expect(parsed[0].id).toBe('rt-0')
    expect(parsed[99].id).toBe('rt-99')
  })
})

// =============================================================================
// Status Display Formatting
// =============================================================================

describe('status display formatting', () => {
  it('displays all optional fields when present', async () => {
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [{
          id: 'rt-full',
          display_name: 'full-agent',
          status: 'connected',
          provider: 'manual',
          runtime_tier: 'byo',
          channel_mode: 'native',
          last_seen_at: new Date(Date.now() - 30_000).toISOString(),
          agent_count: 3,
          cpu_percent: 45,
          ram_percent: 60,
          uptime_seconds: 7200,
          openclaw_version: 'agent-bridge/0.1.0',
        }],
      }),
    )

    await statusCommand('rt-full')

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('full-agent')
    expect(output).toContain('connected')
    expect(output).toContain('manual')
    expect(output).toContain('byo')
    expect(output).toContain('C2a self-sovereign')
    expect(output).toContain('3') // agent_count
    expect(output).toContain('45%')
    expect(output).toContain('60%')
    expect(output).toContain('2h 0m')
    expect(output).toContain('agent-bridge/0.1.0')
  })

  it('displays minimal fields when optional data is absent', async () => {
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [{
          id: 'rt-minimal',
          status: 'pending',
          provider: 'manual',
        }],
      }),
    )

    await statusCommand('rt-minimal')

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('rt-minimal')
    expect(output).toContain('pending')
    // No CPU/RAM/uptime lines
    expect(output).not.toContain('CPU:')
    expect(output).not.toContain('RAM:')
    expect(output).not.toContain('Uptime:')
  })

  it('status with --json outputs valid JSON', async () => {
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [{
          id: 'rt-json',
          status: 'connected',
          provider: 'manual',
          cpu_percent: 50,
        }],
      }),
    )

    await statusCommand('rt-json', { json: true })

    const parsed = JSON.parse(consoleLogCalls[0])
    expect(parsed.id).toBe('rt-json')
    expect(parsed.status).toBe('connected')
    expect(parsed.cpu_percent).toBe(50)
  })
})

// =============================================================================
// Env File Validation
// =============================================================================

describe('env file e2e', () => {
  it('init writes env file with correct permissions and content', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-env-test' }, apiKey: 'key-env-secret' }),
    )
    const writeSync = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'env-test', output: '/tmp/test.env' })

    expect(writeSync).toHaveBeenCalledTimes(1)
    const [filePath, content, options] = writeSync.mock.calls[0]

    // Correct path
    expect(filePath).toContain('test.env')

    // Correct permissions (0o600 = owner read/write only)
    expect(options).toEqual(expect.objectContaining({ mode: 0o600 }))

    // Content has all required vars
    const contentStr = content as string
    expect(contentStr).toContain('LUCID_RUNTIME_ID=rt-env-test')
    expect(contentStr).toContain('LUCID_RUNTIME_KEY=key-env-secret')
    expect(contentStr).toContain('LUCID_CONTROL_PLANE_URL=')

    // Content has header comments
    expect(contentStr).toContain('# Lucid Agent Bridge')
    expect(contentStr).toContain('# Runtime: env-test')
    expect(contentStr).toContain('# Mode: full')

    writeSync.mockRestore()
  })

  it('env command reads and displays all vars from env file', async () => {
    vi.restoreAllMocks()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      [
        '# Lucid Agent Bridge',
        '# Runtime: my-agent',
        '',
        'LUCID_RUNTIME_ID=rt-read-test',
        'LUCID_RUNTIME_KEY=long-key-that-exceeds-sixteen-chars',
        'LUCID_CONTROL_PLANE_URL=https://lucid.foundation',
        '',
      ].join('\n'),
    )

    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })

    await envCommand('/tmp/test.env')

    const output = logCalls.join('\n')
    expect(output).toContain('LUCID_RUNTIME_ID=rt-read-test')
    expect(output).toContain('LUCID_CONTROL_PLANE_URL=https://lucid.foundation')
    // Key should be masked
    expect(output).toContain('long-key...')
    expect(output).not.toContain('long-key-that-exceeds-sixteen-chars')
  })
})

// =============================================================================
// Auth Chain Precedence E2E
// =============================================================================

describe('auth chain precedence e2e', () => {
  it('--token flag overrides LUCID_TOKEN env var', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    // Set env token
    process.env.LUCID_TOKEN = 'env-token'

    // Use flag token — the org resolution call should use flag token
    mockFetch.mockResolvedValueOnce(jsonResponse([{ id: 'org-flag' }]))
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-flag' }, apiKey: 'k' }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'flag-test', token: 'flag-token', json: true })

    // Verify the org call used flag-token
    const orgCall = mockFetch.mock.calls[0]
    expect((orgCall[1] as any).headers.Authorization).toBe('Bearer flag-token')
  })

  it('--url flag overrides LUCID_CONTROL_PLANE_URL env var', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    process.env.LUCID_CONTROL_PLANE_URL = 'https://env-url.test'

    mockFetch.mockResolvedValueOnce(jsonResponse([{ id: 'org-1' }]))
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-url' }, apiKey: 'k' }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'url-test', url: 'https://flag-url.test', json: true })

    // Verify the org call used flag URL
    const orgCall = mockFetch.mock.calls[0]
    expect((orgCall[0] as string)).toContain('flag-url.test')
  })
})

// =============================================================================
// Malformed API Response Handling
// =============================================================================

describe('malformed API response handling', () => {
  it('list handles unexpected response shape (no runtimes key)', async () => {
    withOrg()
    // API returns just an array (alternative format)
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: 'rt-1', status: 'connected', provider: 'manual', runtime_tier: 'byo', display_name: 'direct-array' },
      ]),
    )

    await listCommand()

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('direct-array')
  })

  it('list handles response with extra/unknown fields', async () => {
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [{
          id: 'rt-1',
          display_name: 'extra-fields',
          status: 'connected',
          provider: 'manual',
          runtime_tier: 'byo',
          // Extra fields the CLI doesn't know about
          unknown_field: true,
          internal_data: { nested: 'value' },
        }],
      }),
    )

    await listCommand()

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('extra-fields')
  })

  it('init handles missing fields in creation response', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    withOrg()
    // Missing apiKey (broken API)
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-broken' } }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    // Should not crash — writes undefined for missing key
    await initCommand({ name: 'broken-test', json: true })

    const output = consoleLogCalls.find((l) => l.includes('runtimeId'))
    expect(output).toBeDefined()
  })
})

// =============================================================================
// Init Mode Options
// =============================================================================

describe('init mode options', () => {
  it('passes channel mode to runtime creation', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-native' }, apiKey: 'k' }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'native-test', channelMode: 'native', json: true })

    // Verify the creation request used channelMode: 'native'
    const createCall = mockFetch.mock.calls.find(
      (c: unknown[]) => (c[1] as any)?.method === 'POST',
    )
    expect(createCall).toBeDefined()
    const body = JSON.parse((createCall![1] as any).body)
    expect(body.channelMode).toBe('native')
  })

  it('defaults to relay channel mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    withOrg()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-relay' }, apiKey: 'k' }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'relay-test', json: true })

    const createCall = mockFetch.mock.calls.find(
      (c: unknown[]) => (c[1] as any)?.method === 'POST',
    )
    const body = JSON.parse((createCall![1] as any).body)
    expect(body.channelMode).toBe('relay')
  })
})
