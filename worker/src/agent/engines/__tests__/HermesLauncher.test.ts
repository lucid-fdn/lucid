import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'

const access = vi.fn()
const mkdir = vi.fn()
const readFile = vi.fn()
const writeFile = vi.fn()
const spawn = vi.fn()

vi.mock('node:fs/promises', () => ({
  access,
  mkdir,
  readFile,
  writeFile,
}))

vi.mock('node:fs', () => ({
  constants: {
    X_OK: 1,
  },
}))

vi.mock('node:child_process', () => ({
  spawn,
}))

function createChild() {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {}
  return {
    stdout: {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[`stdout:${event}`] ??= []
        handlers[`stdout:${event}`].push(cb)
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[`stderr:${event}`] ??= []
        handlers[`stderr:${event}`].push(cb)
      }),
    },
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] ??= []
      handlers[event].push(cb)
    }),
    kill: vi.fn(),
    emit(event: string, ...args: any[]) {
      for (const cb of handlers[event] ?? []) cb(...args)
    },
    emitStdout(text: string) {
      for (const cb of handlers['stdout:data'] ?? []) cb(Buffer.from(text))
    },
    emitStderr(text: string) {
      for (const cb of handlers['stderr:data'] ?? []) cb(Buffer.from(text))
    },
  }
}

describe('HermesLauncher', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    access.mockResolvedValue(undefined)
    mkdir.mockResolvedValue(undefined)
    readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    writeFile.mockResolvedValue(undefined)
    delete process.env.LUCID_API_BASE_URL
    delete process.env.LUCID_API_KEY
    delete process.env.TRUSTGATE_BASE_URL
    delete process.env.TRUSTGATE_API_KEY
    delete process.env.HOME
    delete process.env.HERMES_HOME
  })

  it('verifies an explicit binary path before running --version', async () => {
    const child = createChild()
    spawn.mockReturnValue(child)

    const { HermesLauncher } = await import('../hermes/HermesLauncher.js')
    const launcher = new HermesLauncher('/usr/local/bin/hermes')
    const verifyPromise = launcher.verifyInstalled()
    await Promise.resolve()
    child.emit('close', 0)
    await verifyPromise

    expect(access).toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      '/usr/local/bin/hermes',
      ['--version'],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })

  it('runs prompts through hermes chat and returns normalized usage', async () => {
    const child = createChild()
    spawn.mockReturnValue(child)

    process.env.LUCID_API_BASE_URL = 'https://trustgate-api-production.up.railway.app'
    process.env.LUCID_API_KEY = 'lucid-secret'
    process.env.HOME = '/home/node'

    const { HermesLauncher } = await import('../hermes/HermesLauncher.js')
    const launcher = new HermesLauncher('/usr/local/bin/hermes')

    const runPromise = launcher.runPrompt({
      command: 'hermes',
      args: ['chat'],
      bridgeMode: 'observe',
      runtimeId: 'rt-1',
      runtimeKey: 'key',
      controlPlaneUrl: 'http://localhost:3000',
      engineVersion: 'hermes',
      runtimeVersion: 'runtime',
      port: 3000,
      timeoutMs: 60_000,
      toolsets: [],
      model: 'openai/gpt-4.1',
    }, 'hello world')

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1)
    })
    child.emitStdout('done')
    child.emit('close', 0)

    const result = await runPromise

    expect(spawn).toHaveBeenCalledWith(
      '/usr/local/bin/hermes',
      ['chat', '-q', 'hello world', '--quiet', '--model', 'openai/gpt-4.1'],
      expect.objectContaining({
        stdio: 'pipe',
        env: expect.objectContaining({
          OPENAI_BASE_URL: 'https://trustgate-api-production.up.railway.app/v1',
          OPENAI_API_BASE: 'https://trustgate-api-production.up.railway.app/v1',
          OPENAI_API_KEY: 'lucid-secret',
          LLM_MODEL: 'openai/gpt-4.1',
        }),
      }),
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.hermes'),
      expect.stringContaining('provider: custom'),
      'utf8',
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.hermes'),
      expect.stringContaining('base_url: https://trustgate-api-production.up.railway.app/v1'),
      'utf8',
    )
    expect(result.responseText).toBe('done')
    expect(result.tokenUsage.inputTokens).toBeGreaterThan(0)
    expect(result.tokenUsage.outputTokens).toBeGreaterThan(0)
  })

  it('bridges Hermes CLI requests through a local TrustGate header proxy', async () => {
    let receivedHeaders: Record<string, string | string[] | undefined> = {}
    let receivedBody: Record<string, unknown> | undefined
    const upstream = createServer((req, res) => {
      receivedHeaders = req.headers
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      req.on('end', () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      })
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()))
    const address = upstream.address()
    if (!address || typeof address === 'string') throw new Error('Failed to start test upstream')

    const child = createChild()
    spawn.mockImplementation((_command, _args, options) => {
      const env = options.env as NodeJS.ProcessEnv
      void fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer cli-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: [] }),
      }).then(() => {
        child.emitStdout('done')
        child.emit('close', 0)
      })
      return child
    })

    process.env.TRUSTGATE_BASE_URL = `http://127.0.0.1:${address.port}`
    process.env.TRUSTGATE_API_KEY = 'lucid-secret'
    process.env.HOME = '/home/node'

    const { HermesLauncher } = await import('../hermes/HermesLauncher.js')
    const launcher = new HermesLauncher('/usr/local/bin/hermes')

    await launcher.runPrompt({
      command: 'hermes',
      args: ['chat'],
      bridgeMode: 'observe',
      runtimeId: 'rt-1',
      runtimeKey: 'key',
      controlPlaneUrl: 'http://localhost:3000',
      engineVersion: 'hermes',
      runtimeVersion: 'runtime',
      port: 3000,
      timeoutMs: 60_000,
      toolsets: [],
      model: 'openai/gpt-4.1',
      trustGateHeaders: {
        'x-lucid-org-id': 'org-1',
        'x-lucid-assistant-id': 'asst-1',
        'x-lucid-inference-mode': 'byok',
      },
    }, 'hello world')

    expect(receivedHeaders.authorization).toBe('Bearer lucid-secret')
    expect(receivedHeaders['x-lucid-org-id']).toBe('org-1')
    expect(receivedHeaders['x-lucid-assistant-id']).toBe('asst-1')
    expect(receivedHeaders['x-lucid-inference-mode']).toBe('byok')
    expect(receivedBody?.model).toBe('openai/gpt-4.1')
    expect(spawn).toHaveBeenCalledWith(
      '/usr/local/bin/hermes',
      ['chat', '-q', 'hello world', '--quiet', '--model', 'openai/gpt-4.1'],
      expect.objectContaining({
        env: expect.objectContaining({
          OPENAI_BASE_URL: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/v1$/),
          OPENAI_API_BASE: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/v1$/),
        }),
      }),
    )

    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  })

  it('does not rewrite Hermes config when custom provider is already set', async () => {
    const child = createChild()
    spawn.mockReturnValue(child)

    process.env.LUCID_API_BASE_URL = 'https://trustgate-api-production.up.railway.app'
    process.env.LUCID_API_KEY = 'lucid-secret'
    process.env.HOME = '/home/node'
    readFile.mockResolvedValue([
      'model:',
      '  provider: custom',
      '  base_url: https://trustgate-api-production.up.railway.app/v1',
      '',
    ].join('\n'))

    const { HermesLauncher } = await import('../hermes/HermesLauncher.js')
    const launcher = new HermesLauncher('/usr/local/bin/hermes')

    const runPromise = launcher.runPrompt({
      command: 'hermes',
      args: ['chat'],
      bridgeMode: 'observe',
      runtimeId: 'rt-1',
      runtimeKey: 'key',
      controlPlaneUrl: 'http://localhost:3000',
      engineVersion: 'hermes',
      runtimeVersion: 'runtime',
      port: 3000,
      timeoutMs: 60_000,
      toolsets: [],
      model: 'openai/gpt-4.1',
    }, 'hello again')

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1)
    })
    child.emitStdout('done')
    child.emit('close', 0)

    await runPromise

    expect(writeFile).not.toHaveBeenCalled()
  })
})
