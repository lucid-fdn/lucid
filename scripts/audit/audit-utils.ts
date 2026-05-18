import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import type { AuditCommandResult, AuditFinding, AuditSeverity } from './audit-types'

const execFileAsync = promisify(execFile)

const DEFAULT_EXCLUDES = new Set([
  '.git',
  '.next',
  '.next-build',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.vercel',
  '.railway',
])

export async function walkFiles(root: string, options: {
  includeExtensions?: string[]
  includeGlobs?: RegExp[]
  excludeDirs?: Set<string>
} = {}): Promise<string[]> {
  const files: string[] = []
  const includeExtensions = options.includeExtensions
  const includeGlobs = options.includeGlobs
  const excludeDirs = new Set([...DEFAULT_EXCLUDES, ...(options.excludeDirs ?? [])])

  async function visit(current: string) {
    const basename = path.basename(current)
    if (excludeDirs.has(basename) || basename.startsWith('.next-smoke-')) return
    const info = await stat(current).catch(() => null)
    if (!info) return
    if (info.isDirectory()) {
      const entries = await readdir(current)
      for (const entry of entries) {
        await visit(path.join(current, entry))
      }
      return
    }
    if (!info.isFile()) return
    const relative = toPosix(path.relative(root, current))
    if (includeExtensions && !includeExtensions.some((extension) => relative.endsWith(extension))) return
    if (includeGlobs && !includeGlobs.some((pattern) => pattern.test(relative))) return
    files.push(relative)
  }

  await visit(root)
  return files.sort()
}

export async function readText(root: string, file: string): Promise<string> {
  return readFile(path.join(root, file), 'utf8')
}

export async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  const target = path.join(root, file)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`)
}

export async function writeMarkdown(root: string, file: string, value: string): Promise<void> {
  const target = path.join(root, file)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, value.endsWith('\n') ? value : `${value}\n`)
}

export function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

export function lineNumberForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length
}

export function createFinding(input: Omit<AuditFinding, 'id' | 'status'> & { status?: AuditFinding['status'] }): AuditFinding {
  const hashInput = [
    input.severity,
    input.subsystem,
    input.title,
    input.file ?? '',
    input.line ?? '',
  ].join(':')
  return {
    id: stableId(hashInput),
    status: input.status ?? 'open',
    ...input,
  }
}

export function stableId(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return `audit_${Math.abs(hash).toString(36)}`
}

export function findingCounts(findings: AuditFinding[]): Record<AuditSeverity, number> {
  return {
    P0: findings.filter((finding) => finding.severity === 'P0').length,
    P1: findings.filter((finding) => finding.severity === 'P1').length,
    P2: findings.filter((finding) => finding.severity === 'P2').length,
    P3: findings.filter((finding) => finding.severity === 'P3').length,
  }
}

export async function runCommand(command: string, args: string[], options: {
  cwd: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  skip?: boolean
  reason?: string
}): Promise<AuditCommandResult> {
  const startedAt = Date.now()
  const printable = [command, ...args].join(' ')
  if (options.skip) {
    return {
      command: printable,
      ok: true,
      skipped: true,
      reason: options.reason ?? 'Skipped',
      durationMs: 0,
    }
  }

  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 8 * 1024 * 1024,
    })
    return {
      command: printable,
      ok: true,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      command: printable,
      ok: false,
      durationMs: Date.now() - startedAt,
      stdout: err.stdout,
      stderr: err.stderr ?? err.message,
    }
  }
}
