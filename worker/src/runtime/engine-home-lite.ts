import { createHash } from 'crypto'
import { lstat, mkdir, readdir, readFile, readlink, rm, symlink, writeFile } from 'fs/promises'
import path from 'path'

export const ENGINE_HOME_SNAPSHOT_VERSION = 'engine-home-snapshot-v1'
export const ENGINE_HOME_ARCHIVE_VERSION = 'engine-home-archive-v1'
export const ENGINE_HOME_MANIFEST_VERSION = 'engine-home-manifest-v1'

const IGNORED_DIR_NAMES = new Set(['.git', 'node_modules'])

type EngineHomeCollectedEntry = {
  relativePath: string
  entryType: 'file' | 'symlink'
  symlinkTarget?: string
  symlinkTargetKind?: string
  symlinkTargetSha256?: string
}

function hashBytesSha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeRelativePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || trimmed === '.' || trimmed.includes('\0') || trimmed.includes('\\') || trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error('Unsafe engine home path')
  }
  const normalized = path.posix.normalize(trimmed)
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error('Unsafe engine home path')
  }
  return normalized
}

function resolveHomePath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const target = path.resolve(root, ...normalizeRelativePath(relativePath).split('/'))
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Engine home path resolved outside the home root')
  }
  return target
}

function classifyEngineHomePath(engine: string, relativePath: string): Record<string, unknown> {
  const lower = normalizeRelativePath(relativePath).toLowerCase()
  const layout = engine === 'hermes' ? 'hermes_home' : engine === 'openclaw' ? 'openclaw_home' : 'generic_home'
  if (lower.includes('memory') || lower.startsWith('memories/')) return { engine, layout, kind: 'memory', mutability: 'runtime_mutable', confidence: 0.8 }
  if (lower.startsWith('skills/') || lower.endsWith('/skill.md')) return { engine, layout, kind: 'skill', mutability: 'runtime_mutable', confidence: 0.8 }
  if (lower.startsWith('sessions/') || lower.includes('session')) return { engine, layout, kind: 'session', mutability: 'runtime_mutable', confidence: 0.72 }
  if (lower.startsWith('cache/') || lower.includes('/cache/')) return { engine, layout, kind: 'cache', mutability: 'cache', confidence: 0.7 }
  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml') || lower.endsWith('.md')) {
    return { engine, layout, kind: 'config', mutability: engine === 'hermes' ? 'lucid_managed' : 'user_mutable', confidence: 0.68 }
  }
  return { engine, layout, kind: 'unknown', mutability: 'runtime_mutable', confidence: 0.3 }
}

function normalizeSafeSymlinkTarget(input: string): string | null {
  if (!input || input.includes('\0') || input.includes('\\') || input.startsWith('/') || /^[A-Za-z]:/.test(input)) {
    return null
  }
  const normalized = path.posix.normalize(input)
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    return null
  }
  return normalized
}

function describeSymlinkTarget(input: string): Record<string, unknown> {
  const safeTarget = normalizeSafeSymlinkTarget(input)
  if (safeTarget) return { symlinkTarget: safeTarget }
  return {
    symlinkTargetKind: input.startsWith('/') || /^[A-Za-z]:/.test(input) ? 'absolute_or_external' : 'unsafe_relative',
    symlinkTargetSha256: hashBytesSha256(input),
  }
}

async function collectEntries(
  rootDir: string,
  currentDir: string,
  prefix = '',
): Promise<EngineHomeCollectedEntry[]> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const files: EngineHomeCollectedEntry[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isSymbolicLink()) {
      const target = await readlink(path.join(currentDir, entry.name))
      files.push({
        relativePath: normalizeRelativePath(relative),
        entryType: 'symlink',
        ...describeSymlinkTarget(target),
      })
      continue
    }
    if (entry.isDirectory()) {
      if (!IGNORED_DIR_NAMES.has(entry.name)) files.push(...await collectEntries(rootDir, path.join(currentDir, entry.name), relative))
      continue
    }
    if (entry.isFile()) files.push({ relativePath: normalizeRelativePath(relative), entryType: 'file' })
  }
  return files
}

function digestEntries(entries: Array<Record<string, unknown>>): string {
  return hashBytesSha256(stableJson(entries.map((entry) => ({
      relativePath: entry.relativePath,
      entryType: entry.entryType,
      symlinkTarget: entry.symlinkTarget,
      symlinkTargetKind: entry.symlinkTargetKind,
      symlinkTargetSha256: entry.symlinkTargetSha256,
      bytes: entry.bytes,
      sha256: entry.sha256,
      classification: entry.classification,
  }))))
}

export async function snapshotEngineHome(options: {
  engine: string
  runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous'
  rootDir: string
  homeId: string
  metadata?: Record<string, unknown>
  maxFileBytes?: number
}): Promise<Record<string, unknown>> {
  const rootDir = path.resolve(options.rootDir)
  const maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024
  const files = await collectEntries(rootDir, rootDir)
  const entries: Array<Record<string, unknown>> = []

  for (const entry of files) {
    const relativePath = entry.relativePath
    if (entry.entryType === 'symlink') {
      const symlinkTarget = entry.symlinkTarget ?? ''
      const externalDigest = entry.symlinkTargetSha256 ?? ''
      entries.push({
        relativePath,
        entryType: 'symlink',
        ...(symlinkTarget ? { symlinkTarget } : {}),
        ...(entry.symlinkTargetKind ? { symlinkTargetKind: entry.symlinkTargetKind } : {}),
        ...(externalDigest ? { symlinkTargetSha256: externalDigest } : {}),
        bytes: 0,
        sha256: hashBytesSha256(`symlink:${symlinkTarget || externalDigest}`),
        classification: classifyEngineHomePath(options.engine, relativePath),
      })
      continue
    }

    const filePath = resolveHomePath(rootDir, relativePath)
    const info = await lstat(filePath)
    if (info.size > maxFileBytes) {
      entries.push({
        relativePath,
        entryType: 'file',
        skipped: 'max_file_bytes',
        bytes: info.size,
        sha256: hashBytesSha256(`skipped:max_file_bytes:${relativePath}:${info.size}`),
        mtimeMs: info.mtimeMs,
        classification: classifyEngineHomePath(options.engine, relativePath),
      })
      continue
    }
    const content = await readFile(filePath)
    entries.push({
      relativePath,
      entryType: 'file',
      bytes: content.byteLength,
      sha256: hashBytesSha256(content),
      mtimeMs: info.mtimeMs,
      classification: classifyEngineHomePath(options.engine, relativePath),
    })
  }

  entries.sort((left, right) => String(left.relativePath).localeCompare(String(right.relativePath)))
  return {
    version: ENGINE_HOME_SNAPSHOT_VERSION,
    engine: options.engine,
    runtimeFlavor: options.runtimeFlavor,
    homeId: options.homeId,
    createdAt: new Date().toISOString(),
    rootDigest: digestEntries(entries),
    entries,
    metadata: options.metadata ?? {},
  }
}

export function diffEngineHomeSnapshots(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, unknown> {
  const beforeEntries = Array.isArray(before?.entries) ? before.entries as Array<Record<string, unknown>> : []
  const afterEntries = Array.isArray(after.entries) ? after.entries as Array<Record<string, unknown>> : []
  const beforeByPath = new Map(beforeEntries.map((entry) => [String(entry.relativePath), entry]))
  const afterByPath = new Map(afterEntries.map((entry) => [String(entry.relativePath), entry]))
  const added: Array<Record<string, unknown>> = []
  const removed: Array<Record<string, unknown>> = []
  const modified: Array<Record<string, unknown>> = []
  const unchanged: Array<Record<string, unknown>> = []

  for (const [relativePath, afterEntry] of afterByPath) {
    const beforeEntry = beforeByPath.get(relativePath)
    if (!beforeEntry) added.push(afterEntry)
    else if (beforeEntry.sha256 !== afterEntry.sha256 || beforeEntry.bytes !== afterEntry.bytes) modified.push({ before: beforeEntry, after: afterEntry })
    else unchanged.push(afterEntry)
  }
  for (const [relativePath, beforeEntry] of beforeByPath) {
    if (!afterByPath.has(relativePath)) removed.push(beforeEntry)
  }

  return {
    beforeDigest: before?.rootDigest ?? null,
    afterDigest: after.rootDigest ?? null,
    added,
    removed,
    modified,
    unchanged,
    summary: { added: added.length, removed: removed.length, modified: modified.length, unchanged: unchanged.length },
  }
}

function encodeArchiveContent(content: Buffer): Record<string, string> {
  const text = content.toString('utf8')
  return Buffer.compare(Buffer.from(text, 'utf8'), content) === 0
    ? { encoding: 'utf8', content: text }
    : { encoding: 'base64', content: content.toString('base64') }
}

function decodeArchiveContent(file: Record<string, unknown>): Buffer {
  return file.encoding === 'utf8'
    ? Buffer.from(String(file.content ?? ''), 'utf8')
    : Buffer.from(String(file.content ?? ''), 'base64')
}

export async function createEngineHomeArchive(options: {
  engine: string
  runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous'
  rootDir: string
  homeId: string
  metadata?: Record<string, unknown>
  maxFileBytes?: number
  labels?: Record<string, string>
}): Promise<{ manifest: Record<string, unknown>; files: Array<Record<string, unknown>> }> {
  const snapshot = await snapshotEngineHome(options)
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries as Array<Record<string, unknown>> : []
  const files: Array<Record<string, unknown>> = []
  for (const entry of entries) {
    const relativePath = String(entry.relativePath)
    if (entry.entryType === 'symlink') {
      const safeTarget = typeof entry.symlinkTarget === 'string' && entry.symlinkTarget.trim()
        ? normalizeSafeSymlinkTarget(entry.symlinkTarget)
        : null
      files.push({
        ...entry,
        encoding: safeTarget ? 'symlink' : 'symlink-external',
        ...(safeTarget ? { target: safeTarget } : {}),
      })
      continue
    }
    if (entry.skipped) {
      files.push({
        ...entry,
        encoding: 'omitted',
        omitReason: entry.skipped,
      })
      continue
    }
    const content = await readFile(resolveHomePath(options.rootDir, relativePath))
    files.push({ ...entry, ...encodeArchiveContent(content) })
  }
  return {
    manifest: {
      version: ENGINE_HOME_MANIFEST_VERSION,
      snapshotVersion: snapshot.version,
      engine: snapshot.engine,
      runtimeFlavor: snapshot.runtimeFlavor,
      homeId: snapshot.homeId,
      rootDigest: snapshot.rootDigest,
      entryCount: entries.length,
      totalBytes: entries.reduce((sum, entry) => sum + Number(entry.bytes ?? 0), 0),
      createdAt: snapshot.createdAt,
      labels: options.labels ?? {},
    },
    files,
  }
}

export async function hydrateEngineHomeArchive(
  targetRootDir: string,
  archive: Record<string, unknown>,
  options: { clean?: boolean } = {},
): Promise<Record<string, unknown>> {
  const targetRoot = path.resolve(targetRootDir)
  if (options.clean) await rm(targetRoot, { recursive: true, force: true })
  await mkdir(targetRoot, { recursive: true })
  const files = Array.isArray(archive.files) ? archive.files as Array<Record<string, unknown>> : []
  for (const file of files) {
    const relativePath = String(file.relativePath)
    if (file.encoding === 'symlink-external') {
      continue
    }
    if (file.encoding === 'omitted') {
      continue
    }
    if (file.encoding === 'symlink') {
      const target = normalizeSafeSymlinkTarget(String(file.target ?? file.symlinkTarget ?? ''))
      if (!target) continue
      if (hashBytesSha256(`symlink:${target}`) !== file.sha256) throw new Error(`Engine home archive hash mismatch: ${relativePath}`)
      const symlinkPath = resolveHomePath(targetRoot, relativePath)
      await mkdir(path.dirname(symlinkPath), { recursive: true })
      await rm(symlinkPath, { force: true })
      await symlink(target, symlinkPath)
      continue
    }
    const content = decodeArchiveContent(file)
    if (hashBytesSha256(content) !== file.sha256) throw new Error(`Engine home archive hash mismatch: ${relativePath}`)
    const target = resolveHomePath(targetRoot, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  const manifest = archive.manifest as Record<string, unknown> | undefined
  return snapshotEngineHome({
    engine: String(manifest?.engine ?? 'unknown'),
    runtimeFlavor: manifest?.runtimeFlavor as 'shared' | 'c1_managed' | 'c2a_autonomous' | undefined,
    homeId: String(manifest?.homeId ?? 'restored'),
    rootDir: targetRoot,
  })
}
