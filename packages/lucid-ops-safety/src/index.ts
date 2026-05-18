import { spawn } from 'node:child_process'
import { lstat, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export type TrustedCommandPolicy = {
  readonly cwd: string
  readonly command: string
  readonly args?: readonly string[]
  readonly timeoutMs?: number
  readonly env?: Record<string, string | undefined>
  readonly allowShell?: false
  readonly redactEnvKeys?: readonly string[]
}

export type TrustedCommandResult = {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
  readonly timedOut: boolean
}

export class UnsafeOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeOperationError'
  }
}

export async function runTrustedCommand(policy: TrustedCommandPolicy): Promise<TrustedCommandResult> {
  const cwd = assertSafeCwd(policy.cwd)
  assertSafeCommand(policy.command)
  const args = [...(policy.args ?? [])]
  assertSafeArgs(args)

  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn(policy.command, args, {
      cwd,
      env: buildSafeEnv(policy.env, policy.redactEnvKeys),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = policy.timeoutMs
      ? setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, policy.timeoutMs)
      : null

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (exitCode, signal) => {
      if (timeout) clearTimeout(timeout)
      resolve({
        command: policy.command,
        args,
        cwd,
        exitCode,
        signal,
        stdout: redactKnownSecrets(stdout),
        stderr: redactKnownSecrets(stderr),
        durationMs: Date.now() - startedAt,
        timedOut,
      })
    })
  })
}

export type SafeRemovePlan = {
  readonly root: string
  readonly target: string
  readonly relativeTarget: string
  readonly exists: boolean
  readonly isDirectory: boolean
  readonly dryRun: boolean
  readonly reason: string
}

export type SafeRemoveInput = {
  readonly root: string
  readonly target: string
  readonly reason: string
  readonly dryRun?: boolean
  readonly recursive?: boolean
  readonly requireInsideRoot?: boolean
}

export async function planSafeRemove(input: SafeRemoveInput): Promise<SafeRemovePlan> {
  const root = assertSafeCwd(input.root)
  const target = path.resolve(root, input.target)
  assertSafeRemovalTarget({ root, target, requireInsideRoot: input.requireInsideRoot ?? true })
  const stat = await lstat(target).catch(() => null)
  return {
    root,
    target,
    relativeTarget: path.relative(root, target),
    exists: Boolean(stat),
    isDirectory: Boolean(stat?.isDirectory()),
    dryRun: input.dryRun ?? true,
    reason: input.reason,
  }
}

export async function executeSafeRemove(input: SafeRemoveInput & { confirmed: true }): Promise<SafeRemovePlan> {
  const plan = await planSafeRemove({ ...input, dryRun: false })
  if (!plan.exists) return plan
  await rm(plan.target, { recursive: input.recursive ?? plan.isDirectory, force: false })
  return plan
}

export function assertSafeCwd(cwd: string): string {
  const resolved = path.resolve(cwd)
  if (resolved === '/' || resolved === homedir()) {
    throw new UnsafeOperationError(`Refusing unsafe cwd: ${resolved}`)
  }
  return resolved
}

export function assertSafeCommand(command: string): void {
  if (!command.trim()) throw new UnsafeOperationError('Command is required.')
  if (/[;&|`$<>]/.test(command)) {
    throw new UnsafeOperationError('Command must be an executable name or path, not shell syntax.')
  }
}

export function assertSafeArgs(args: readonly string[]): void {
  for (const arg of args) {
    if (arg.includes('\0')) throw new UnsafeOperationError('Command arguments cannot contain null bytes.')
  }
}

export function assertSafeRemovalTarget(input: { root: string; target: string; requireInsideRoot?: boolean }): void {
  const root = path.resolve(input.root)
  const target = path.resolve(input.target)
  if (target === '/' || target === root || target === homedir()) {
    throw new UnsafeOperationError(`Refusing to remove unsafe target: ${target}`)
  }
  if ((input.requireInsideRoot ?? true) && !isPathInside(root, target)) {
    throw new UnsafeOperationError(`Refusing to remove target outside root: ${target}`)
  }
}

export function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function buildSafeEnv(env?: Record<string, string | undefined>, redactEnvKeys: readonly string[] = []): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = { ...process.env, ...env }
  for (const key of redactEnvKeys) delete safeEnv[key]
  return safeEnv
}

function redactKnownSecrets(value: string): string {
  return value
    .replace(/\b(sk|bb_live|ste|bu)_[A-Za-z0-9_=-]{12,}\b/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, (match) => (looksLikeSecret(match) ? '[REDACTED]' : match))
}

function looksLikeSecret(value: string): boolean {
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
}
