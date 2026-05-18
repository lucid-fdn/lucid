import { createHash } from 'node:crypto'
import { z } from 'zod'

const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_FILES = 1000

const DEFAULT_ALLOWED_API_PREFIXES = [
  '/api/app-runtime/v1/public/apps/',
  '/api/app-runtime/v1/sdk/',
]

const BLOCKED_INTERNAL_API_PREFIXES = [
  '/api/admin',
  '/api/agent-commerce',
  '/api/app-services',
  '/api/app-runtime/v1/operator',
  '/api/assistants',
  '/api/billing',
  '/api/crews',
  '/api/dags',
  '/api/internal',
  '/api/mission-control',
  '/api/oauth',
  '/api/oauth-tools',
  '/api/organizations',
  '/api/orgs',
  '/api/provider',
  '/api/provider-keys',
  '/api/runtimes',
  '/api/subscriptions',
  '/api/usage',
  '/api/webhooks/agent-commerce',
  '/api/webhooks/stripe/agent-commerce',
  '/api/workflows',
]

const BLOCKED_SPLIT_API_SEGMENTS = [
  'admin',
  'agent-commerce',
  'app-services',
  'app-runtime/v1/operator',
  'assistants',
  'billing',
  'crews',
  'dags',
  'internal',
  'mission-control',
  'oauth',
  'oauth-tools',
  'organizations',
  'orgs',
  'provider',
  'provider-keys',
  'runtimes',
  'subscriptions',
  'usage',
  'webhooks/agent-commerce',
  'webhooks/stripe/agent-commerce',
  'workflows',
]

const BLOCKED_GENERATED_FRONTEND_IMPORTS = [
  '@/app/api',
  '@/lib/agent-commerce',
  '@/lib/agent-wallets',
  '@/lib/ai',
  '@/lib/app-service',
  '@/lib/auth',
  '@/lib/db',
  '@/lib/entitlements',
  '@/lib/mission-control',
  '@/lib/oauth',
  '@/lib/payments',
  '@/lib/runtimes',
  '@/lib/session-signers',
  '@/lib/trading',
  '@/lib/usage',
  '@/server',
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  '@anthropic-ai/sdk',
  '@solana/web3.js',
  '@supabase/auth-helpers-nextjs',
  '@supabase/supabase-js',
  '@upstash/redis',
  '@vercel/blob',
  '@vercel/kv',
  '@vercel/postgres',
  '@x402/evm',
  '@x402/fetch',
  'ai',
  'coinbase-commerce-node',
  'ethers',
  'openai',
  'stripe',
]

const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
]

const DEFAULT_ALLOWED_DEPENDENCIES = [
  '@lucid/app-runtime-sdk',
  '@radix-ui/*',
  '@tailwindcss/postcss',
  '@vercel/analytics',
  '@vercel/speed-insights',
  'autoprefixer',
  'class-variance-authority',
  'clsx',
  'date-fns',
  'framer-motion',
  'lucide-react',
  'motion',
  'next',
  'next-themes',
  'postcss',
  'react',
  'react-dom',
  'sonner',
  'tailwind-merge',
  'tailwindcss',
  'tailwindcss-animate',
  'tw-animate-css',
  'typescript',
  'zod',
]

const DEFAULT_ALLOWED_LICENSES = [
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'MPL-2.0',
  'UNLICENSED',
]

const BLOCKED_LICENSE_PATTERN = /\b(AGPL|GPL|LGPL|SSPL|BUSL|Elastic License|Commons Clause|PolyForm)\b/i

const PACKAGE_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

const BLOCKED_LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
]

const GeneratedCodeRawFileSchema = z.object({
  path: z.string().optional(),
  name: z.string().optional(),
  content: z.string(),
  locked: z.boolean().optional(),
}).passthrough()

export const GeneratedCodeFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string(),
  locked: z.boolean().optional(),
})

export type GeneratedCodeFile = z.infer<typeof GeneratedCodeFileSchema>

export interface GeneratedCodeFinding {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string
  line?: number
}

export interface GeneratedCodeValidationOptions {
  maxTotalBytes?: number
  maxFiles?: number
  allowedApiPrefixes?: string[]
  allowedHosts?: string[]
  allowedDependencies?: string[]
  allowedLicenses?: string[]
  requirePackageJson?: boolean
}

export interface GeneratedCodeValidationResult {
  passed: boolean
  files: GeneratedCodeFile[]
  findings: GeneratedCodeFinding[]
  checksum: string
  totalBytes: number
  fileCount: number
}

interface NormalizedPathResult {
  path?: string
  error?: string
}

function getConfiguredMaxTotalBytes(maxTotalBytes?: number): number {
  if (typeof maxTotalBytes === 'number' && Number.isFinite(maxTotalBytes)) return maxTotalBytes
  const configured = Number.parseInt(process.env.APP_SERVICE_MAX_GENERATED_SOURCE_BYTES || '', 10)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_TOTAL_BYTES
}

function getConfiguredAllowedHosts(allowedHosts?: string[]): string[] {
  const configured = process.env.APP_SERVICE_ALLOWED_FRONTEND_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean) ?? []

  return [...DEFAULT_ALLOWED_HOSTS, ...configured, ...(allowedHosts ?? [])]
}

function getConfiguredAllowedDependencies(allowedDependencies?: string[]): string[] {
  const configured = process.env.APP_SERVICE_ALLOWED_GENERATED_DEPENDENCIES?.split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean) ?? []

  return [...DEFAULT_ALLOWED_DEPENDENCIES, ...configured, ...(allowedDependencies ?? [])]
}

function getConfiguredAllowedLicenses(allowedLicenses?: string[]): string[] {
  const configured = process.env.APP_SERVICE_ALLOWED_GENERATED_LICENSES?.split(',')
    .map((license) => license.trim())
    .filter(Boolean) ?? []

  return [...DEFAULT_ALLOWED_LICENSES, ...configured, ...(allowedLicenses ?? [])]
}

function normalizeGeneratedPath(rawPath: string): NormalizedPathResult {
  const trimmed = rawPath.trim().replace(/\\/g, '/')
  if (!trimmed) return { error: 'File path is empty.' }
  if (trimmed.includes('\0')) return { error: 'File path contains a null byte.' }
  if (trimmed.startsWith('/') || trimmed.startsWith('//') || /^[A-Za-z]:\//.test(trimmed)) {
    return { error: 'File path must be relative.' }
  }

  const withoutLeadingDot = trimmed.replace(/^\.\/+/, '')
  const segments = withoutLeadingDot.split('/').filter(Boolean)
  if (segments.includes('..')) return { error: 'File path must not traverse directories.' }
  if (segments.length === 0) return { error: 'File path is empty.' }

  return { path: segments.join('/') }
}

function coerceRawFiles(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (!input || typeof input !== 'object') return []

  return Object.entries(input as Record<string, unknown>).map(([path, entry]) => {
    if (typeof entry === 'string') return { path, content: entry }
    if (entry && typeof entry === 'object') {
      return { path, ...(entry as Record<string, unknown>) }
    }
    return { path, content: '' }
  })
}

function lineForIndex(content: string, index: number): number {
  return content.slice(0, Math.max(index, 0)).split('\n').length
}

function computeChecksum(files: GeneratedCodeFile[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function isAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  return allowedHosts.some((allowedHost) => {
    if (hostname === allowedHost) return true
    return !allowedHost.startsWith('*') && hostname.endsWith(`.${allowedHost}`)
  })
}

function isAllowedApiPath(value: string, allowedApiPrefixes: string[]): boolean {
  return allowedApiPrefixes.some((prefix) => value.startsWith(prefix))
}

function blockedInternalApiPrefix(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\\/g, '/')
  return BLOCKED_INTERNAL_API_PREFIXES.find((prefix) => normalized.startsWith(prefix)) ?? null
}

function isAllowedDependency(name: string, allowedDependencies: string[]): boolean {
  return allowedDependencies.some((allowedDependency) => {
    if (allowedDependency === name) return true
    if (!allowedDependency.endsWith('*')) return false
    return name.startsWith(allowedDependency.slice(0, -1))
  })
}

function isAllowedLicense(license: string, allowedLicenses: string[]): boolean {
  const normalized = license.trim()
  if (!normalized || BLOCKED_LICENSE_PATTERN.test(normalized)) return false
  return allowedLicenses.some((allowedLicense) => normalized === allowedLicense)
}

function extractStringLiterals(source: string): Array<{ value: string; index: number }> {
  const literalPattern = /(['"`])([^'"`]{0,2000})\1/g
  return [...source.matchAll(literalPattern)].map((match) => ({
    value: match[2] ?? '',
    index: match.index ?? 0,
  }))
}

function pushInternalApiFinding(
  file: GeneratedCodeFile,
  findings: GeneratedCodeFinding[],
  value: string,
  index: number,
  code = 'internal_api_reference',
): void {
  findings.push({
    severity: 'error',
    code,
    message: `Generated code references non-public Lucid API path "${value}".`,
    path: file.path,
    line: lineForIndex(file.content, index),
  })
}

function scanEndpointLiterals(
  file: GeneratedCodeFile,
  findings: GeneratedCodeFinding[],
  allowedApiPrefixes: string[],
  allowedHosts: string[],
): void {
  const literalPattern = /(['"`])((?:https?:\/\/|\/api\/)[^'"`]+)\1/g

  for (const match of file.content.matchAll(literalPattern)) {
    const value = match[2]
    if (!value) continue

    if (value.startsWith('/api/')) {
      if (blockedInternalApiPrefix(value) || !isAllowedApiPath(value, allowedApiPrefixes)) {
        pushInternalApiFinding(file, findings, value, match.index ?? 0)
      }
      continue
    }

    try {
      const url = new URL(value)
      if (url.pathname.startsWith('/api/')) {
        if (!isAllowedHost(url.hostname, allowedHosts) || !isAllowedApiPath(url.pathname, allowedApiPrefixes)) {
          findings.push({
            severity: 'error',
            code: 'external_api_reference',
            message: `Generated code references a non-allowlisted API URL "${value}".`,
            path: file.path,
            line: lineForIndex(file.content, match.index ?? 0),
          })
        }
      }
    } catch {
      findings.push({
        severity: 'warning',
        code: 'invalid_url_literal',
        message: `Generated code contains an invalid URL literal "${value}".`,
        path: file.path,
        line: lineForIndex(file.content, match.index ?? 0),
      })
    }
  }
}

function scanSplitApiConcatenations(
  file: GeneratedCodeFile,
  findings: GeneratedCodeFinding[],
  allowedApiPrefixes: string[],
): void {
  const concatenationPattern = /(?:['"`][^'"`]*['"`]\s*\+\s*)+['"`][^'"`]*['"`]/g

  for (const match of file.content.matchAll(concatenationPattern)) {
    const expression = match[0]
    const fragments = extractStringLiterals(expression).map((literal) => literal.value)
    const joined = fragments.join('')
    const apiIndex = joined.indexOf('/api/')
    if (apiIndex === -1) continue

    const value = joined.slice(apiIndex)
    if (value.startsWith('/api/') && !isAllowedApiPath(value, allowedApiPrefixes)) {
      pushInternalApiFinding(file, findings, value, match.index ?? 0)
    }
  }
}

function scanBlockedInternalRouteFragments(
  file: GeneratedCodeFile,
  findings: GeneratedCodeFinding[],
  allowedApiPrefixes: string[],
): void {
  for (const literal of extractStringLiterals(file.content)) {
    const value = literal.value.trim()
    if (!value) continue

    if (value.startsWith('/api/')) continue

    const normalized = value.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '')
    const blockedSegment = BLOCKED_SPLIT_API_SEGMENTS.find((segment) => (
      normalized === segment
      || normalized.startsWith(`${segment}/`)
      || normalized.includes(`/${segment}/`)
    ))
    if (!blockedSegment) continue

    const surroundingSource = file.content
      .slice(Math.max(0, literal.index - 140), literal.index + value.length + 140)
      .toLowerCase()
    if (!surroundingSource.includes('/api/')) continue

    pushInternalApiFinding(file, findings, value, literal.index, 'internal_api_fragment')
  }
}

function scanSecrets(file: GeneratedCodeFile, findings: GeneratedCodeFinding[]): void {
  const patterns: Array<{ code: string; pattern: RegExp; message: string }> = [
    {
      code: 'private_key_material',
      pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
      message: 'Generated code contains private key material.',
    },
    {
      code: 'secret_assignment',
      pattern: /\b(?:V0_API_KEY|VERCEL(?:_API)?_TOKEN|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|PRIVATE_KEY)\s*[:=]/g,
      message: 'Generated code contains a secret-looking assignment.',
    },
    {
      code: 'secret_token_literal',
      pattern: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,})\b/g,
      message: 'Generated code contains a secret-looking token literal.',
    },
  ]

  for (const item of patterns) {
    for (const match of file.content.matchAll(item.pattern)) {
      findings.push({
        severity: 'error',
        code: item.code,
        message: item.message,
        path: file.path,
        line: lineForIndex(file.content, match.index ?? 0),
      })
    }
  }

  const envPattern = /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g
  for (const match of file.content.matchAll(envPattern)) {
    const variable = match[1]
    if (!variable || variable.startsWith('NEXT_PUBLIC_') || variable === 'NODE_ENV' || variable === 'VERCEL_ENV') {
      continue
    }

    findings.push({
      severity: 'error',
      code: 'server_env_reference',
      message: `Generated frontend code reads non-public environment variable "${variable}".`,
      path: file.path,
      line: lineForIndex(file.content, match.index ?? 0),
    })
  }
}

function isForbiddenGeneratedFrontendImport(source: string): boolean {
  const normalized = source.toLowerCase()
  return BLOCKED_GENERATED_FRONTEND_IMPORTS.some((blockedImport) => (
    normalized === blockedImport
    || normalized.startsWith(`${blockedImport}/`)
  ))
}

function scanForbiddenImports(file: GeneratedCodeFile, findings: GeneratedCodeFinding[]): void {
  const importPatterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ]

  for (const pattern of importPatterns) {
    for (const match of file.content.matchAll(pattern)) {
      const source = match[1]
      if (!source || !isForbiddenGeneratedFrontendImport(source)) continue
      findings.push({
        severity: 'error',
        code: 'forbidden_server_import',
        message: `Generated frontend code imports server-only or provider-secret module "${source}".`,
        path: file.path,
        line: lineForIndex(file.content, match.index ?? 0),
      })
    }
  }
}

function scanServerEntrypoints(file: GeneratedCodeFile, findings: GeneratedCodeFinding[]): void {
  if (file.path.startsWith('app/api/') || file.path.startsWith('pages/api/')) {
    findings.push({
      severity: 'error',
      code: 'server_api_route',
      message: 'Generated frontend bundles must not add server API routes.',
      path: file.path,
    })
  }
}

function scanPackageJson(
  file: GeneratedCodeFile,
  findings: GeneratedCodeFinding[],
  allowedDependencies: string[],
  allowedLicenses: string[],
): void {
  if (file.path !== 'package.json') return

  let parsed: unknown
  try {
    parsed = JSON.parse(file.content) as unknown
  } catch {
    findings.push({
      severity: 'error',
      code: 'invalid_package_json',
      message: 'Generated package.json is not valid JSON.',
      path: file.path,
    })
    return
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    findings.push({
      severity: 'error',
      code: 'invalid_package_json',
      message: 'Generated package.json must be a JSON object.',
      path: file.path,
    })
    return
  }

  const packageJson = parsed as Record<string, unknown>
  if (typeof packageJson.license === 'string' && !isAllowedLicense(packageJson.license, allowedLicenses)) {
    findings.push({
      severity: 'error',
      code: 'disallowed_license',
      message: `Generated package.json uses non-allowlisted license "${packageJson.license}".`,
      path: file.path,
    })
  }

  const scripts = packageJson.scripts
  if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
    for (const scriptName of BLOCKED_LIFECYCLE_SCRIPTS) {
      if (scriptName in scripts) {
        findings.push({
          severity: 'error',
          code: 'package_lifecycle_script',
          message: `Generated package.json must not define "${scriptName}" lifecycle scripts.`,
          path: file.path,
        })
      }
    }
  }

  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const dependencies = packageJson[field]
    if (!dependencies) continue

    if (typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      findings.push({
        severity: 'error',
        code: 'invalid_dependency_block',
        message: `Generated package.json field "${field}" must be an object.`,
        path: file.path,
      })
      continue
    }

    for (const [dependencyName, dependencySpec] of Object.entries(dependencies)) {
      if (!isAllowedDependency(dependencyName, allowedDependencies)) {
        findings.push({
          severity: 'error',
          code: 'disallowed_dependency',
          message: `Generated package.json depends on non-allowlisted package "${dependencyName}".`,
          path: file.path,
        })
      }

      if (
        dependencySpec
        && typeof dependencySpec === 'object'
        && !Array.isArray(dependencySpec)
        && typeof (dependencySpec as Record<string, unknown>).license === 'string'
        && !isAllowedLicense((dependencySpec as Record<string, unknown>).license as string, allowedLicenses)
      ) {
        findings.push({
          severity: 'error',
          code: 'disallowed_dependency_license',
          message: `Generated package.json dependency "${dependencyName}" uses a non-allowlisted license.`,
          path: file.path,
        })
      }
    }
  }
}

export function validateGeneratedCodeFiles(
  input: unknown,
  options: GeneratedCodeValidationOptions = {},
): GeneratedCodeValidationResult {
  const findings: GeneratedCodeFinding[] = []
  const files: GeneratedCodeFile[] = []
  const seenPaths = new Set<string>()
  const rawFiles = coerceRawFiles(input)
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES

  if (rawFiles.length === 0) {
    findings.push({
      severity: 'error',
      code: 'empty_source_archive',
      message: 'Provider returned no generated files.',
    })
  }

  if (rawFiles.length > maxFiles) {
    findings.push({
      severity: 'error',
      code: 'too_many_files',
      message: `Provider returned ${rawFiles.length} files, above the ${maxFiles} file limit.`,
    })
  }

  for (const rawFile of rawFiles.slice(0, maxFiles)) {
    const parsed = GeneratedCodeRawFileSchema.safeParse(rawFile)
    if (!parsed.success) {
      findings.push({
        severity: 'error',
        code: 'invalid_file_shape',
        message: 'Generated file is missing a string path/name or content.',
      })
      continue
    }

    const rawPath = parsed.data.path ?? parsed.data.name ?? ''
    const normalized = normalizeGeneratedPath(rawPath)
    if (!normalized.path) {
      findings.push({
        severity: 'error',
        code: 'unsafe_file_path',
        message: normalized.error ?? 'Generated file path is unsafe.',
        path: rawPath,
      })
      continue
    }

    if (seenPaths.has(normalized.path)) {
      findings.push({
        severity: 'error',
        code: 'duplicate_file_path',
        message: `Generated source archive contains duplicate file path "${normalized.path}".`,
        path: normalized.path,
      })
      continue
    }

    seenPaths.add(normalized.path)
    files.push(GeneratedCodeFileSchema.parse({
      path: normalized.path,
      content: parsed.data.content,
      locked: parsed.data.locked,
    }))
  }

  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0)
  const maxTotalBytes = getConfiguredMaxTotalBytes(options.maxTotalBytes)
  if (totalBytes > maxTotalBytes) {
    findings.push({
      severity: 'error',
      code: 'source_archive_too_large',
      message: `Generated source archive is ${totalBytes} bytes, above the ${maxTotalBytes} byte limit.`,
    })
  }

  const allowedApiPrefixes = options.allowedApiPrefixes ?? DEFAULT_ALLOWED_API_PREFIXES
  const allowedHosts = getConfiguredAllowedHosts(options.allowedHosts)
  const allowedDependencies = getConfiguredAllowedDependencies(options.allowedDependencies)
  const allowedLicenses = getConfiguredAllowedLicenses(options.allowedLicenses)

  if (options.requirePackageJson && !files.some((file) => file.path === 'package.json')) {
    findings.push({
      severity: 'error',
      code: 'missing_package_json',
      message: 'Generated source archive must include package.json for build validation.',
    })
  }

  for (const file of files) {
    scanServerEntrypoints(file, findings)
    scanPackageJson(file, findings, allowedDependencies, allowedLicenses)
    scanForbiddenImports(file, findings)
    scanSecrets(file, findings)
    scanEndpointLiterals(file, findings, allowedApiPrefixes, allowedHosts)
    scanSplitApiConcatenations(file, findings, allowedApiPrefixes)
    scanBlockedInternalRouteFragments(file, findings, allowedApiPrefixes)
  }

  return {
    passed: findings.every((finding) => finding.severity !== 'error'),
    files,
    findings,
    checksum: computeChecksum(files),
    totalBytes,
    fileCount: files.length,
  }
}
