import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface OssExportConfig {
  version: number
  defaultOutputDir: string
  include: string[]
  exclude: string[]
  privatePaths: string[]
  requiredFiles: string[]
  textScan: {
    ignoreFiles: string[]
    forbiddenLiterals: string[]
    forbiddenRegex: string[]
  }
  packageJson: {
    removeScriptsMatching: string[]
    removeScriptsContaining: string[]
  }
}

export interface ExportFile {
  repoPath: string
  absolutePath: string
}

export interface BoundaryValidationResult {
  files: ExportFile[]
  errors: string[]
  warnings: string[]
}

export interface CopyExportOptions {
  outputDir: string
  clean: boolean
  dryRun: boolean
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(__dirname, '..')
const configPath = path.join(repoRoot, 'oss-include.json')

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.oss-export',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
])

const TEXT_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.csv',
  '.env',
  '.example',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
])

export function readOssExportConfig(): OssExportConfig {
  return JSON.parse(readFileSync(configPath, 'utf8')) as OssExportConfig
}

export function normalizeRepoPath(value: string): string {
  return value.replaceAll(path.sep, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

function toRepoPath(file: string): string {
  return normalizeRepoPath(path.relative(repoRoot, file))
}

function hasMagic(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?')
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeRepoPath(pattern)
  const segments = normalized.split('/')
  let source = '^'

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1

    if (segment === '**') {
      source += isLast ? '.*' : '(?:[^/]+/)*'
      return
    }

    const segmentSource = escapeRegExp(segment)
      .replaceAll('\\*', '[^/]*')
      .replaceAll('\\?', '[^/]')

    source += segmentSource
    if (!isLast) source += '/'
  })

  return new RegExp(`${source}$`)
}

function matchesAny(repoPath: string, patterns: string[]): boolean {
  const normalized = normalizeRepoPath(repoPath)
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized))
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  return readdirSync(dir).flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return []

    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) return walkFiles(fullPath)
    if (stats.isFile()) return [fullPath]
    return []
  })
}

function basePathForPattern(pattern: string): string {
  const segments = normalizeRepoPath(pattern).split('/')
  const baseSegments: string[] = []

  for (const segment of segments) {
    if (segment.includes('*') || segment.includes('?')) break
    baseSegments.push(segment)
  }

  return baseSegments.length > 0 ? baseSegments.join('/') : '.'
}

function expandIncludePattern(pattern: string): ExportFile[] {
  const normalized = normalizeRepoPath(pattern)
  const absolute = path.join(repoRoot, normalized)

  if (!hasMagic(normalized) && existsSync(absolute)) {
    const stats = statSync(absolute)
    const files = stats.isDirectory() ? walkFiles(absolute) : [absolute]
    return files.map((file) => ({ repoPath: toRepoPath(file), absolutePath: file }))
  }

  const base = path.join(repoRoot, basePathForPattern(normalized))
  return walkFiles(base)
    .map((file) => ({ repoPath: toRepoPath(file), absolutePath: file }))
    .filter((file) => globToRegExp(normalized).test(file.repoPath))
}

export function buildExportFileList(config = readOssExportConfig()): ExportFile[] {
  const fileMap = new Map<string, ExportFile>()

  for (const includePattern of config.include) {
    for (const file of expandIncludePattern(includePattern)) {
      if (matchesAny(file.repoPath, config.exclude)) continue
      fileMap.set(file.repoPath, file)
    }
  }

  return [...fileMap.values()].sort((a, b) => a.repoPath.localeCompare(b.repoPath))
}

function transformPackageJson(source: string, config: OssExportConfig): string {
  const pkg = JSON.parse(source) as {
    scripts?: Record<string, string>
    [key: string]: unknown
  }

  const scriptNamePatterns = config.packageJson.removeScriptsMatching.map((pattern) => new RegExp(pattern))
  const scriptCommandNeedles = config.packageJson.removeScriptsContaining

  if (pkg.scripts) {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      const removeByName = scriptNamePatterns.some((pattern) => pattern.test(name))
      const removeByCommand = scriptCommandNeedles.some((needle) => command.includes(needle))
      if (removeByName || removeByCommand) {
        delete pkg.scripts[name]
      }
    }
  }

  return `${JSON.stringify(pkg, null, 2)}\n`
}

function stripMarkdownSection(source: string, heading: string): string {
  const lines = source.split('\n')
  const startIndex = lines.findIndex((line) => line.trim() === heading)
  if (startIndex === -1) return source

  const headingLevel = heading.match(/^#+/)?.[0].length ?? 2
  const nextIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) return false
    const match = /^(#+)\s/.exec(line)
    return Boolean(match && match[1].length <= headingLevel)
  })

  const endIndex = nextIndex === -1 ? lines.length : nextIndex
  return [
    ...lines.slice(0, startIndex),
    ...lines.slice(endIndex),
  ].join('\n').replace(/\n{3,}/g, '\n\n')
}

export function transformFileForPublicExport(repoPath: string, source: Buffer, config = readOssExportConfig()): Buffer {
  if (repoPath === 'README.md') {
    const publicReadmePath = path.join(repoRoot, 'docs/PUBLIC_README.md')
    if (existsSync(publicReadmePath)) {
      return Buffer.from(readFileSync(publicReadmePath, 'utf8'), 'utf8')
    }
  }

  if (repoPath === 'package.json') {
    return Buffer.from(transformPackageJson(source.toString('utf8'), config), 'utf8')
  }

  if (repoPath === 'docs/ENV_REFERENCE.md') {
    return Buffer.from(stripMarkdownSection(source.toString('utf8'), '## Native App Release Ops'), 'utf8')
  }

  return source
}

function assertSafeOutputDir(outputDir: string): void {
  const repoRelative = path.relative(repoRoot, outputDir)

  if (repoRelative === '') {
    throw new Error('Refusing to export over the repository root.')
  }

  if (outputDir === path.parse(outputDir).root) {
    throw new Error('Refusing to export over a filesystem root.')
  }

  const outputRelativeToRepo = path.relative(outputDir, repoRoot)
  const outputIsParentOfRepo = outputRelativeToRepo !== ''
    && !outputRelativeToRepo.startsWith('..')
    && !path.isAbsolute(outputRelativeToRepo)

  if (outputIsParentOfRepo) {
    throw new Error(`Refusing to export into a parent directory of the repository: ${outputDir}`)
  }

  const outputIsInsideRepo = !repoRelative.startsWith('..') && !path.isAbsolute(repoRelative)
  if (outputIsInsideRepo && !repoRelative.startsWith('.oss-export/')) {
    throw new Error(`Refusing to export into a source-controlled repo path: ${repoRelative}`)
  }
}

function isTextFile(repoPath: string): boolean {
  const extension = path.extname(repoPath)
  return TEXT_EXTENSIONS.has(extension)
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function scanTextFile(file: ExportFile, config: OssExportConfig): string[] {
  if (!isTextFile(file.repoPath)) return []
  if (matchesAny(file.repoPath, config.textScan.ignoreFiles)) return []

  const source = transformFileForPublicExport(file.repoPath, readFileSync(file.absolutePath), config).toString('utf8')
  const errors: string[] = []

  for (const literal of config.textScan.forbiddenLiterals) {
    const index = source.indexOf(literal)
    if (index !== -1) {
      errors.push(`${file.repoPath}:${lineForIndex(source, index)} contains forbidden public-export literal "${literal}".`)
    }
  }

  for (const patternSource of config.textScan.forbiddenRegex) {
    const pattern = new RegExp(patternSource, 'i')
    const match = pattern.exec(source)
    if (match?.index !== undefined) {
      errors.push(`${file.repoPath}:${lineForIndex(source, match.index)} matches forbidden public-export pattern /${patternSource}/i.`)
    }
  }

  return errors
}

function validatePackageJsonTransform(files: ExportFile[], config: OssExportConfig): string[] {
  const packageJson = files.find((file) => file.repoPath === 'package.json')
  if (!packageJson) return ['package.json must be included in the public export.']

  const transformed = transformPackageJson(readFileSync(packageJson.absolutePath, 'utf8'), config)
  const pkg = JSON.parse(transformed) as { scripts?: Record<string, string> }
  const errors: string[] = []

  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (/^(desktop|mobile|native):/.test(name)) {
      errors.push(`Transformed package.json still exposes private native script "${name}".`)
    }

    for (const needle of config.packageJson.removeScriptsContaining) {
      if (command.includes(needle)) {
        errors.push(`Transformed package.json script "${name}" still references private command target "${needle}".`)
      }
    }
  }

  return errors
}

export function validatePublicBoundary(config = readOssExportConfig()): BoundaryValidationResult {
  const files = buildExportFileList(config)
  const filePaths = new Set(files.map((file) => file.repoPath))
  const errors: string[] = []
  const warnings: string[] = []

  if (config.version !== 1) {
    errors.push(`Unsupported oss-include.json version "${config.version}".`)
  }

  for (const requiredFile of config.requiredFiles) {
    if (!filePaths.has(requiredFile)) {
      errors.push(`Required public export file is missing from allowlist: ${requiredFile}`)
    }
  }

  for (const file of files) {
    if (matchesAny(file.repoPath, config.privatePaths)) {
      errors.push(`Private path would be exported: ${file.repoPath}`)
    }
  }

  for (const file of files) {
    errors.push(...scanTextFile(file, config))
  }

  errors.push(...validatePackageJsonTransform(files, config))

  if (filePaths.has('package-lock.json')) {
    errors.push('package-lock.json must not be exported until private app workspace entries are stripped.')
  }

  if (!filePaths.has('docs/OPEN_SOURCE_EXPORT.md')) {
    warnings.push('docs/OPEN_SOURCE_EXPORT.md is not included; public export operators will lack publishing guidance.')
  }

  return { files, errors, warnings }
}

export function copyPublicExport(files: ExportFile[], options: CopyExportOptions, config = readOssExportConfig()): void {
  const outputDir = path.resolve(repoRoot, options.outputDir)
  assertSafeOutputDir(outputDir)

  if (existsSync(outputDir)) {
    if (!options.clean) {
      throw new Error(`Output directory already exists: ${outputDir}. Pass --clean to replace it.`)
    }
    rmSync(outputDir, { recursive: true, force: true })
  }

  if (options.dryRun) return

  mkdirSync(outputDir, { recursive: true })

  for (const file of files) {
    const target = path.join(outputDir, file.repoPath)
    mkdirSync(path.dirname(target), { recursive: true })

    const source = readFileSync(file.absolutePath)
    const transformed = transformFileForPublicExport(file.repoPath, source, config)

    if (transformed === source) {
      copyFileSync(file.absolutePath, target)
    } else {
      writeFileSync(target, transformed)
    }
  }

  writeFileSync(
    path.join(outputDir, '.oss-export-manifest.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: path.basename(repoRoot),
      fileCount: files.length,
      configVersion: config.version,
    }, null, 2)}\n`,
  )
}
