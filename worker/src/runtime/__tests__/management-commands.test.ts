import { mkdtemp, mkdir, readFile, readlink, symlink, writeFile, rm } from 'fs/promises'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSink, RuntimeManagementCommand } from '../data-sink.js'
import { processRuntimeManagementCommands } from '../management-commands.js'

const originalEnv = { ...process.env }

function isSymlinkPrivilegeError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'EPERM' || code === 'EACCES'
}

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

function command(input: Partial<RuntimeManagementCommand> = {}): RuntimeManagementCommand {
  return {
    id: input.id ?? '00000000-0000-4000-8000-000000000001',
    runtimeId: input.runtimeId ?? '00000000-0000-4000-8000-000000000002',
    orgId: input.orgId ?? '00000000-0000-4000-8000-000000000003',
    commandType: input.commandType ?? 'adapter.probe',
    targetCapabilityId: input.targetCapabilityId ?? null,
    payload: input.payload ?? {},
    status: input.status ?? 'sent',
    response: input.response ?? null,
    error: input.error ?? null,
    requestedBy: input.requestedBy ?? null,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    dispatchedAt: input.dispatchedAt ?? null,
    acknowledgedAt: input.acknowledgedAt ?? null,
    expiresAt: input.expiresAt ?? null,
  }
}

function ackingSink() {
  const acks: Array<{ commandId: string; status: string; response?: Record<string, unknown> | null; error?: string | null }> = []
  const sink: DataSink = {
    async reportHeartbeat() { return null },
    async ackManagementCommand(commandId, status, response, error) {
      acks.push({ commandId, status, response, error })
    },
    async reportEvents() {},
    async submitApproval() { return 'approval-1' },
    async pollApprovalResolution() { return null },
    async reportHealthScores() {},
    async reportCosts() {},
  }
  return { sink, acks }
}

describe('runtime management command processor', () => {
  it('runs adapter probes and acknowledges lifecycle states', async () => {
    process.env.LUCID_ENGINE = 'openclaw'
    process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'

    const { sink, acks } = ackingSink()
    await processRuntimeManagementCommands([command({ commandType: 'adapter.probe' })], sink)

    expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'applied'])
    expect(acks[1]?.response?.probe).toMatchObject({ adapterType: 'openclaw' })
  })

  it('runs transcript parser tests through the adapter contract/fallback surface', async () => {
    process.env.LUCID_ENGINE = 'hermes'
    process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'

    const { sink, acks } = ackingSink()
    await processRuntimeManagementCommands([
      command({ commandType: 'transcript.parser.test', payload: { fixture: 'user: hello\nassistant: hi' } }),
    ], sink)

    expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'applied'])
    expect(acks[1]?.response?.parser).toMatchObject({ adapterType: 'hermes', supported: true })
  })

  it('snapshots runtime-owned engine homes without returning raw file contents by default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-ehv-command-'))
    try {
      await mkdir(path.join(root, 'skills', 'alpha'), { recursive: true })
      await writeFile(path.join(root, 'skills', 'alpha', 'SKILL.md'), 'alpha skill')
      process.env.LUCID_ENGINE = 'hermes'
      process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'
      process.env.HERMES_HOME = root

      const { sink, acks } = ackingSink()
      await processRuntimeManagementCommands([command({ commandType: 'engine_home.snapshot' })], sink)

      expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'applied'])
      expect(acks[1]?.response?.snapshot).toMatchObject({ engine: 'hermes', entryCount: 1 })
      expect(JSON.stringify(acks[1]?.response)).not.toContain('alpha skill')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('executes engine-home diff, export, and rollback commands through the worker-owned implementation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-ehv-command-loop-'))
    try {
      const memoryPath = path.join(root, 'memories', 'daily.md')
      await mkdir(path.dirname(memoryPath), { recursive: true })
      await writeFile(memoryPath, 'before')
      process.env.LUCID_ENGINE = 'openclaw'
      process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'
      process.env.OPENCLAW_HOME = root

      const { sink, acks } = ackingSink()
      await processRuntimeManagementCommands([command({ id: 'snapshot', commandType: 'engine_home.snapshot' })], sink)
      const beforeSnapshot = acks[1]?.response?.snapshot as Record<string, unknown>

      await writeFile(memoryPath, 'after')
      await processRuntimeManagementCommands([
        command({ id: 'diff', commandType: 'engine_home.diff', payload: { beforeSnapshot } }),
        command({ id: 'export', commandType: 'engine_home.export', payload: { includeContents: true } }),
      ], sink)

      const diffAck = acks.find((ack) => ack.commandId === 'diff' && ack.status === 'applied')
      expect(diffAck?.response?.diff).toMatchObject({ summary: { modified: 1 } })

      const exportAck = acks.find((ack) => ack.commandId === 'export' && ack.status === 'applied')
      const archive = exportAck?.response?.archive as Record<string, unknown>
      expect(archive?.manifest).toMatchObject({ engine: 'openclaw', entryCount: 1 })

      await writeFile(memoryPath, 'broken')
      await processRuntimeManagementCommands([
        command({ id: 'rollback', commandType: 'engine_home.rollback', payload: { archive, clean: true, confirm: true } }),
      ], sink)

      const rollbackAck = acks.find((ack) => ack.commandId === 'rollback' && ack.status === 'applied')
      expect(rollbackAck?.response?.snapshot).toMatchObject({ engine: 'openclaw', entryCount: 1 })
      expect(await readFile(memoryPath, 'utf8')).toBe('after')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('snapshots and restores safe runtime-home symlinks without following them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-ehv-symlink-'))
    try {
      await mkdir(path.join(root, 'hermes-agent', 'venv', 'bin'), { recursive: true })
      await writeFile(path.join(root, 'hermes-agent', 'venv', 'bin', 'python3.13'), 'binary placeholder')
      await writeFile(path.join(root, 'hermes-agent', 'venv', 'bin', 'ruff'), Buffer.alloc(2 * 1024 * 1024 + 1))
      try {
        await symlink('python3.13', path.join(root, 'hermes-agent', 'venv', 'bin', 'python'))
        await symlink('/tmp/external-python', path.join(root, 'hermes-agent', 'venv', 'bin', 'python-external'))
      } catch (error) {
        if (isSymlinkPrivilegeError(error)) return
        throw error
      }
      process.env.LUCID_ENGINE = 'hermes'
      process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'
      process.env.HERMES_HOME = root

      const { sink, acks } = ackingSink()
      await processRuntimeManagementCommands([
        command({ id: 'export-symlink', commandType: 'engine_home.export', payload: { includeContents: true } }),
      ], sink)

      const exportAck = acks.find((ack) => ack.commandId === 'export-symlink' && ack.status === 'applied')
      const archive = exportAck?.response?.archive as Record<string, unknown>
      const files = archive.files as Array<Record<string, unknown>>
      expect(files.find((file) => file.relativePath === 'hermes-agent/venv/bin/python')).toMatchObject({
        entryType: 'symlink',
        encoding: 'symlink',
        target: 'python3.13',
      })
      expect(files.find((file) => file.relativePath === 'hermes-agent/venv/bin/python-external')).toMatchObject({
        entryType: 'symlink',
        encoding: 'symlink-external',
        symlinkTargetKind: 'absolute_or_external',
      })
      expect(files.find((file) => file.relativePath === 'hermes-agent/venv/bin/ruff')).toMatchObject({
        entryType: 'file',
        encoding: 'omitted',
        omitReason: 'max_file_bytes',
      })

      await rm(path.join(root, 'hermes-agent'), { recursive: true, force: true })
      await processRuntimeManagementCommands([
        command({ id: 'rollback-symlink', commandType: 'engine_home.rollback', payload: { archive, clean: false, confirm: true } }),
      ], sink)

      const rollbackAck = acks.find((ack) => ack.commandId === 'rollback-symlink' && ack.status === 'applied')
      expect(rollbackAck?.response?.snapshot).toMatchObject({ engine: 'hermes', entryCount: 2 })
      await expect(readlink(path.join(root, 'hermes-agent', 'venv', 'bin', 'python'))).resolves.toBe('python3.13')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prepares an empty OpenClaw home before engine-home commands', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'lucid-openclaw-home-parent-'))
    const root = path.join(parent, 'missing', '.openclaw')
    try {
      process.env.LUCID_ENGINE = 'openclaw'
      process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'
      process.env.OPENCLAW_HOME = root

      const { sink, acks } = ackingSink()
      await processRuntimeManagementCommands([command({ commandType: 'engine_home.snapshot' })], sink)

      expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'applied'])
      expect(acks[1]?.response?.snapshot).toMatchObject({ engine: 'openclaw', entryCount: 0 })
      expect(fs.existsSync(root)).toBe(true)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('observes runtime-native schedules from the runtime home without exposing paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-native-schedule-command-'))
    try {
      await writeFile(path.join(root, 'native-schedules.json'), JSON.stringify({
        schedules: [
          { id: 'native-1', name: 'Native review', cron: '0 9 * * *', timezone: 'UTC', prompt: 'Review local state.' },
        ],
      }))
      process.env.LUCID_ENGINE = 'hermes'
      process.env.LUCID_RUNTIME_ID = '00000000-0000-4000-8000-000000000002'
      process.env.HERMES_HOME = root

      const { sink, acks } = ackingSink()
      await processRuntimeManagementCommands([command({ commandType: 'native_scheduler.observe' })], sink)

      expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'applied'])
      expect(acks[1]?.response).toMatchObject({
        action: 'native_scheduler.observe',
        engine: 'hermes',
        scheduleCount: 1,
        executionDelegated: false,
      })
      expect(JSON.stringify(acks[1]?.response)).not.toContain(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('requires Routine Kernel audit for native schedule imports', async () => {
    const { sink, acks } = ackingSink()
    await processRuntimeManagementCommands([
      command({
        commandType: 'native_scheduler.import',
        payload: {
          schedules: [{ id: 'native-2', name: 'Native import', cron: '30 8 * * 1-5' }],
        },
      }),
    ], sink)

    expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'needs_user_action'])
    expect(acks[1]?.error).toContain('Routine Kernel')
    expect(acks[1]?.response).toMatchObject({ scheduleCount: 1, executionDelegated: false })
  })

  it('rejects unsupported commands instead of silently dropping them', async () => {
    const { sink, acks } = ackingSink()
    await processRuntimeManagementCommands([command({ commandType: 'engine.magic' })], sink)

    expect(acks.map((ack) => ack.status)).toEqual(['accepted', 'rejected'])
    expect(acks[1]?.error).toContain('Unsupported runtime management command')
  })
})
