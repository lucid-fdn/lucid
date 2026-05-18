import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bridgeInstances: FakeBridge[] = []

class FakeBridge {
  config: Record<string, unknown>
  managementHandler?: (commands: any[]) => Promise<any[] | void>

  constructor(config: Record<string, unknown>) {
    this.config = config
    bridgeInstances.push(this)
  }

  onManagementCommand(handler: (commands: any[]) => Promise<any[] | void>) {
    this.managementHandler = handler
  }

  onMessage() {}

  async start() {}

  async stop() {}

  async trackRun(_meta: unknown, fn: () => Promise<unknown>) {
    return fn()
  }
}

vi.mock('@lucid/agent-bridge', () => ({
  LucidBridge: FakeBridge,
}))

const { runCommand } = await import('../cli/commands.js')

describe('run command', () => {
  let tmpDir: string
  let consoleLogCalls: string[]

  beforeEach(() => {
    bridgeInstances.length = 0
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-runtime-run-'))
    consoleLogCalls = []
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLogCalls.push(args.map(String).join(' '))
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('starts a BYO bridge with runtime identity, capabilities, and smoke telemetry', async () => {
    const envFile = path.join(tmpDir, '.env.lucid')
    fs.writeFileSync(
      envFile,
      [
        'LUCID_RUNTIME_ID=rt-local',
        'LUCID_RUNTIME_KEY=runtime-key',
        'LUCID_CONTROL_PLANE_URL=https://lucid.test',
        'LUCID_ENGINE=hermes',
      ].join('\n'),
    )

    await runCommand({ envFile, smoke: true, json: true, durationMs: '0' })

    expect(bridgeInstances).toHaveLength(1)
    expect(bridgeInstances[0]?.config).toMatchObject({
      runtimeId: 'rt-local',
      engine: 'hermes',
      runtimeProtocol: 'lucid-runtime-v2',
    })
    expect(bridgeInstances[0]?.config.adapterIdentity).toMatchObject({
      adapterType: 'lucid-runtime-cli',
      engine: 'hermes',
    })
    expect(JSON.parse(consoleLogCalls.at(-1) ?? '{}')).toMatchObject({
      ok: true,
      runtimeId: 'rt-local',
      engine: 'hermes',
    })
  })

  it('ACKs management commands delivered through the bridge handler', async () => {
    const envFile = path.join(tmpDir, '.env.lucid')
    fs.writeFileSync(
      envFile,
      [
        'LUCID_RUNTIME_ID=rt-local',
        'LUCID_RUNTIME_KEY=runtime-key',
        'LUCID_CONTROL_PLANE_URL=https://lucid.test',
        'LUCID_ENGINE=openclaw',
      ].join('\n'),
    )

    await runCommand({ envFile, smoke: true, durationMs: '0' })
    const acks = await bridgeInstances[0]?.managementHandler?.([
      {
        id: '11111111-1111-1111-1111-111111111111',
        runtimeId: 'rt-local',
        orgId: 'org-1',
        commandType: 'adapter.probe',
        payload: {},
        status: 'sent',
        requestedAt: new Date().toISOString(),
      },
    ])

    expect(acks?.[0]).toMatchObject({
      commandId: '11111111-1111-1111-1111-111111111111',
      status: 'applied',
    })
  })
})
