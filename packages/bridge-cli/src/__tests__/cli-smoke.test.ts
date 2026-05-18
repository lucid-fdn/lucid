import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import {
  initCommand,
  statusCommand,
  listCommand,
  envCommand,
} from '../cli/commands.js'

// ---------------------------------------------------------------------------
// CLI command smoke tests — verify wiring, output, and error handling
// ---------------------------------------------------------------------------

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

  // No credentials by default
  delete process.env.LUCID_TOKEN
  delete process.env.LUCID_CONTROL_PLANE_URL
  delete process.env.LUCID_CONFIG_DIR
  delete process.env.LUCID_CREDENTIALS_FILE
  vi.spyOn(fs, 'existsSync').mockReturnValue(false)
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

/** Set up auth (token + org resolution mock) */
function withAuth() {
  process.env.LUCID_TOKEN = 'test-token'
  mockFetch.mockResolvedValueOnce(jsonResponse([{ id: 'org-1' }]))
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe('auth gate', () => {
  it('init fails without credentials', async () => {
    await expect(initCommand({ name: 'test' })).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Not logged in')
  })

  it('status fails without credentials', async () => {
    await expect(statusCommand('rt-123')).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Not logged in')
  })

  it('list fails without credentials', async () => {
    await expect(listCommand()).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('Not logged in')
  })
})

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

describe('init command', () => {
  it('requires --name in non-interactive mode', async () => {
    withAuth()
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    await expect(initCommand({})).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('--name is required')
  })

  it('creates runtime and outputs JSON', async () => {
    withAuth()
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    // Mock runtime creation
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-new' }, apiKey: 'key-abc' }),
    )

    const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'test-agent', json: true, output: '/tmp/test.env' })

    // Verify JSON output
    const jsonLine = consoleLogCalls.find((line) => line.includes('runtimeId'))
    expect(jsonLine).toBeDefined()
    const parsed = JSON.parse(jsonLine!)
    expect(parsed.runtimeId).toBe('rt-new')
    expect(parsed.apiKey).toBe('key-abc')

    // Verify env file written
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('test.env'),
      expect.stringContaining('LUCID_RUNTIME_ID=rt-new'),
      expect.objectContaining({ mode: 0o600 }),
    )

    mockWriteFileSync.mockRestore()
  })

  it('creates runtime with plain text output', async () => {
    withAuth()
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ runtime: { id: 'rt-plain' }, apiKey: 'key-xyz' }),
    )
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await initCommand({ name: 'plain-agent', output: '/tmp/test.env' })

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('Runtime created: rt-plain')
    expect(output).toContain('Env written to /tmp/test.env')
  })
})

// ---------------------------------------------------------------------------
// Status command
// ---------------------------------------------------------------------------

describe('status command', () => {
  it('displays runtime info', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          {
            id: 'rt-123',
            display_name: 'my-agent',
            status: 'connected',
            provider: 'manual',
            runtime_tier: 'byo',
            cpu_percent: 45,
            ram_percent: 60,
          },
        ],
      }),
    )

    await statusCommand('rt-123')

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('my-agent')
    expect(output).toContain('connected')
    expect(output).toContain('rt-123')
    expect(output).toContain('45%')
  })

  it('outputs JSON with --json flag', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [{ id: 'rt-123', status: 'connected', provider: 'manual' }],
      }),
    )

    await statusCommand('rt-123', { json: true })

    const parsed = JSON.parse(consoleLogCalls[0])
    expect(parsed.id).toBe('rt-123')
    expect(parsed.status).toBe('connected')
  })

  it('fails for unknown runtime', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(jsonResponse({ runtimes: [] }))

    await expect(statusCommand('rt-missing')).rejects.toThrow('exit:1')
    expect(consoleErrorCalls.join('\n')).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// List command
// ---------------------------------------------------------------------------

describe('list command', () => {
  it('lists BYO runtimes only by default', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          { id: 'rt-1', display_name: 'agent-a', status: 'connected', provider: 'manual', runtime_tier: 'byo' },
          { id: 'rt-2', display_name: 'agent-b', status: 'pending', provider: 'manual', runtime_tier: 'byo' },
          { id: 'rt-3', display_name: 'dedicated', status: 'connected', provider: 'railway', runtime_tier: 'dedicated' },
        ],
      }),
    )

    await listCommand()

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('agent-a')
    expect(output).toContain('agent-b')
    expect(output).not.toContain('dedicated')
  })

  it('shows all runtimes with --all', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          { id: 'rt-1', display_name: 'byo-one', status: 'connected', provider: 'manual', runtime_tier: 'byo' },
          { id: 'rt-2', display_name: 'dedicated-one', status: 'connected', provider: 'railway', runtime_tier: 'dedicated' },
        ],
      }),
    )

    await listCommand({ all: true })

    const output = consoleLogCalls.join('\n')
    expect(output).toContain('byo-one')
    expect(output).toContain('dedicated-one')
  })

  it('shows empty message when no runtimes', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(jsonResponse({ runtimes: [] }))

    await listCommand()

    expect(consoleLogCalls.join('\n')).toContain('No BYO runtimes')
  })

  it('outputs JSON with --json', async () => {
    withAuth()
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          { id: 'rt-1', status: 'connected', provider: 'manual', runtime_tier: 'byo' },
        ],
      }),
    )

    await listCommand({ json: true })

    const parsed = JSON.parse(consoleLogCalls[0])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('rt-1')
  })
})

// ---------------------------------------------------------------------------
// Env command
// ---------------------------------------------------------------------------

describe('env command', () => {
  it('displays env vars with masked key', async () => {
    vi.restoreAllMocks()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '# Comment\nLUCID_RUNTIME_ID=rt-abc\nLUCID_RUNTIME_KEY=abcdefghijklmnopqrst\nLUCID_CONTROL_PLANE_URL=https://lucid.test\n',
    )
    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })

    await envCommand('/tmp/.env.lucid')

    const output = logCalls.join('\n')
    expect(output).toContain('LUCID_RUNTIME_ID=rt-abc')
    expect(output).toContain('LUCID_CONTROL_PLANE_URL=https://lucid.test')
    // Key > 16 chars: first 8 + ... + last 4
    expect(output).toContain('abcdefgh...qrst')
    expect(output).not.toContain('abcdefghijklmnopqrst')
  })

  it('masks short keys (<=16 chars)', async () => {
    vi.restoreAllMocks()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'LUCID_RUNTIME_ID=rt-1\nLUCID_RUNTIME_KEY=shortkey\nLUCID_CONTROL_PLANE_URL=https://x\n',
    )
    const logCalls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logCalls.push(args.join(' ')))
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })

    await envCommand()

    const output = logCalls.join('\n')
    expect(output).toContain('shor...')
    expect(output).not.toContain('shortkey')
  })

  it('fails when file not found', async () => {
    vi.restoreAllMocks()
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const errCalls: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => errCalls.push(args.join(' ')))
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })

    await expect(envCommand('/tmp/missing.env')).rejects.toThrow('exit:1')
    expect(errCalls.join('\n')).toContain('not found')
  })

  it('fails when no LUCID_RUNTIME_ID in file', async () => {
    vi.restoreAllMocks()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue('SOME_OTHER_VAR=value\n')
    const errCalls: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => errCalls.push(args.join(' ')))
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })

    await expect(envCommand()).rejects.toThrow('exit:1')
    expect(errCalls.join('\n')).toContain('No LUCID_RUNTIME_ID')
  })
})
