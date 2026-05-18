import crypto from 'node:crypto'

import type { LucidPackManifest } from '@contracts/lucid-pack'

export interface LucidPackManifestSafetyIssue {
  path: string
  reason: 'embedded_secret' | 'secret_like_value'
  message: string
}

export class LucidPackManifestSafetyError extends Error {
  readonly issues: LucidPackManifestSafetyIssue[]

  constructor(issues: LucidPackManifestSafetyIssue[]) {
    super('Lucid pack manifest contains unsafe secret material')
    this.name = 'LucidPackManifestSafetyError'
    this.issues = issues
  }
}

const SECRET_KEY_RE = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|private[_-]?key|authorization|cookie)\b/i
const SECRET_VALUE_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
]
const SAFE_SECRET_REF_RE = /^(secret:\/\/|vault:\/\/|env:|\$\{\{\s*secrets\.)/i

export function assertLucidPackManifestSafe(manifest: LucidPackManifest): void {
  const issues = validateLucidPackManifestSafety(manifest)
  if (issues.length > 0) throw new LucidPackManifestSafetyError(issues)
}

export function validateLucidPackManifestSafety(manifest: LucidPackManifest): LucidPackManifestSafetyIssue[] {
  return [
    ...manifest.resources.flatMap((resource, index) =>
      scanManifestValue(resource.spec, `resources[${index}].spec`),
    ),
    ...scanManifestValue(manifest.composition, 'composition'),
    ...scanManifestValue(manifest.metadata, 'metadata'),
  ]
}

export function hashLucidPackResourceSpec(spec: unknown): string {
  return crypto.createHash('sha256').update(stableJson(spec ?? {})).digest('hex')
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function scanManifestValue(value: unknown, path: string): LucidPackManifestSafetyIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanManifestValue(item, `${path}[${index}]`))
  }
  if (!value || typeof value !== 'object') {
    return inspectScalar(path, value)
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const childPath = `${path}.${key}`
    if (SECRET_KEY_RE.test(key) && typeof nested === 'string' && nested.trim() && !isSafeSecretRef(nested)) {
      return [{
        path: childPath,
        reason: 'embedded_secret' as const,
        message: 'Secret-like manifest fields must reference a secret manager, not embed literal values.',
      }]
    }
    return scanManifestValue(nested, childPath)
  })
}

function inspectScalar(path: string, value: unknown): LucidPackManifestSafetyIssue[] {
  if (typeof value !== 'string' || isSafeSecretRef(value)) return []
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    return [{
      path,
      reason: 'secret_like_value',
      message: 'Manifest value looks like a provider token or private key. Use a secret reference.',
    }]
  }
  return []
}

function isSafeSecretRef(value: string): boolean {
  return SAFE_SECRET_REF_RE.test(value.trim())
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  )
}
