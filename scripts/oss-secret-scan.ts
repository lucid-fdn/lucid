import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { repoRoot } from './oss-export-shared'

interface Finding {
  file: string
  line: number
  rule: string
}

interface Args {
  scope: 'private' | 'export' | 'both'
  exportDir: string
}

const DEFAULT_EXPORT_DIR = '.oss-export/LucidMerged-public'

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

const ALLOWLIST_FILE_PATTERNS = [
  /(^|\/)__tests__\//,
  /(^|\/)fixtures?\//,
  /(^|\/)test-fixtures\//,
  /^tests\//,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /package-lock\.json$/,
  /oss-secret-scan\.ts$/,
]

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'private-key-block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/ },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/ },
  { name: 'openai-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/ },
  { name: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'sendgrid-key', pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { name: 'stripe-secret-key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { name: 'supabase-service-role-jwt', pattern: /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\b/ },
]

const SECRET_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'APNS_AUTH_KEY',
  'APPLE_API_KEY',
  'APPLE_PUSH_KEY',
  'APP_STORE_CONNECT_API_KEY',
  'ASC_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'EAS_TOKEN',
  'ENCRYPTION_KEY',
  'EXPO_TOKEN',
  'FCM_SERVER_KEY',
  'FCM_SERVICE_ACCOUNT',
  'GITHUB_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT',
  'MESSAGE_ENCRYPTION_MASTER_KEY',
  'OPENAI_API_KEY',
  'PRIVY_APP_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'WINDOWS_SIGNING_CERT',
]

function parseArgs(argv: string[]): Args {
  const args: Args = {
    scope: 'both',
    exportDir: DEFAULT_EXPORT_DIR,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--scope') {
      const value = argv[index + 1] as Args['scope'] | undefined
      if (value !== 'private' && value !== 'export' && value !== 'both') {
        throw new Error('--scope must be one of: private, export, both')
      }
      args.scope = value
      index += 1
    } else if (arg === '--export-dir') {
      const value = argv[index + 1]
      if (!value) throw new Error('--export-dir requires a path')
      args.exportDir = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function toPosix(value: string): string {
  return value.replaceAll(path.sep, '/')
}

function isTextFile(file: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(file))
}

function isAllowlisted(file: string, line: string): boolean {
  if (line.includes('pragma: allowlist secret')) return true
  return ALLOWLIST_FILE_PATTERNS.some((pattern) => pattern.test(file))
}

function trackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => isTextFile(file))
    .filter((file) => existsSync(path.join(repoRoot, file)) && statSync(path.join(repoRoot, file)).isFile())
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return []

  return readdirSync(root).flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return []

    const absolute = path.join(root, entry)
    const stats = statSync(absolute)

    if (stats.isDirectory()) return walkFiles(absolute)
    if (stats.isFile() && isTextFile(absolute)) return [absolute]
    return []
  })
}

function envAssignmentLooksSecret(line: string): boolean {
  const envNamePattern = SECRET_ENV_NAMES.join('|')
  const match = new RegExp(`\\b(${envNamePattern})\\b\\s*[:=]\\s*['"]?([^'"\\s#]+)`, 'i').exec(line)
  if (!match) return false

  const value = match[2] ?? ''
  if (!value || value.length < 12) return false
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(value)) return false

  const safeFragments = [
    '${{',
    '$',
    '<',
    '...',
    'config.',
    'process.env',
    'z.',
    'env.',
    'anthropic.',
    'your-',
    'your_',
    'example',
    'placeholder',
    'changeme',
    'dummy',
    'fake',
    'test',
    'redacted',
    'latest',
    'base64',
  ]

  return !safeFragments.some((fragment) => value.toLowerCase().includes(fragment))
}

function scanContent(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  const lines = source.split('\n')

  lines.forEach((line, index) => {
    if (isAllowlisted(file, line)) return

    if (envAssignmentLooksSecret(line)) {
      findings.push({ file, line: index + 1, rule: 'secret-env-assignment' })
    }

    for (const rule of SECRET_PATTERNS) {
      if (rule.pattern.test(line)) {
        findings.push({ file, line: index + 1, rule: rule.name })
      }
    }
  })

  return findings
}

function scanPrivateRepo(): Finding[] {
  return trackedFiles().flatMap((file) => {
    const absolute = path.join(repoRoot, file)
    return scanContent(file, readFileSync(absolute, 'utf8'))
  })
}

function scanExport(exportDir: string): Finding[] {
  const root = path.resolve(repoRoot, exportDir)
  if (!existsSync(root)) {
    throw new Error(`Public export directory does not exist: ${root}. Run npm run oss:export -- --clean first.`)
  }

  return walkFiles(root).flatMap((absolute) => {
    const relative = toPosix(path.relative(root, absolute))
    return scanContent(relative, readFileSync(absolute, 'utf8'))
  })
}

const args = parseArgs(process.argv.slice(2))
const findings: Finding[] = []

if (args.scope === 'private' || args.scope === 'both') {
  findings.push(...scanPrivateRepo())
}

if (args.scope === 'export' || args.scope === 'both') {
  findings.push(...scanExport(args.exportDir))
}

if (findings.length > 0) {
  console.error(`OSS secret scan failed with ${findings.length} finding(s):`)
  for (const finding of findings.slice(0, 200)) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule}`)
  }
  if (findings.length > 200) {
    console.error(`... ${findings.length - 200} more finding(s) omitted`)
  }
  process.exit(1)
}

console.log(`OSS secret scan passed for scope "${args.scope}".`)
