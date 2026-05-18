import type { AuditFinding, EnvSecretInventoryItem } from './audit-types'
import { createFinding, lineNumberForOffset, readText, walkFiles } from './audit-utils'

const SECRET_LITERAL_PATTERNS: Array<{ name: string; pattern: RegExp; risk: EnvSecretInventoryItem['risk'] }> = [
  { name: 'browserbase_live_key', pattern: /\bbb_live_[A-Za-z0-9_-]{12,}\b/g, risk: 'critical' },
  { name: 'steel_api_key', pattern: /\bste-[A-Za-z0-9_-]{20,}\b/g, risk: 'critical' },
  { name: 'browser_use_api_key', pattern: /\bbu_[A-Za-z0-9_-]{20,}\b/g, risk: 'critical' },
  { name: 'openai_api_key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, risk: 'critical' },
  { name: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, risk: 'critical' },
  { name: 'discord_token', pattern: /\bM[TA-Z][A-Za-z\d_-]{20,}\.[A-Za-z\d_-]{6,}\.[A-Za-z\d_-]{20,}\b/g, risk: 'critical' },
]

const PUBLIC_ENV_SENSITIVE = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PRIVATE|PASSWORD|SERVICE_ROLE|API_KEY|KEY)[A-Z0-9_]*/g

const PUBLIC_ENV_ALLOWLIST = new Set([
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_PRIVY_APP_ID',
  'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_NOTIFICATIONS_ENABLED',
  'NEXT_PUBLIC_EMAIL_NOTIFICATIONS',
  'NEXT_PUBLIC_SMS_NOTIFICATIONS',
  'NEXT_PUBLIC_PUSH_NOTIFICATIONS',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
])

export async function buildEnvSecretInventory(root: string): Promise<{
  items: EnvSecretInventoryItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.json', '.yml', '.yaml', '.env.example', '.sql'],
    includeGlobs: [/^(src|worker|packages|scripts|docs|supabase|migrations|contracts|tests)\//, /^CLAUDE\.md$/, /^README\.md$/, /^package\.json$/],
    excludeDirs: new Set(['generated']),
  })
  const items: EnvSecretInventoryItem[] = []

  for (const file of files) {
    const source = await readText(root, file).catch(() => '')
    items.push(...inspectEnvSecrets(file, source))
  }

  const findings = items
    .filter((item) => item.risk === 'critical' || (item.kind === 'public_sensitive_env' && item.risk !== 'low'))
    .map((item) => createFinding({
      severity: item.risk === 'critical' ? 'P0' : item.risk === 'high' ? 'P1' : item.risk === 'medium' ? 'P2' : 'P3',
      subsystem: 'env-secrets',
      title: item.kind === 'public_sensitive_env' ? 'Sensitive-looking NEXT_PUBLIC env reference' : 'Secret-like literal detected',
      file: item.file,
      line: item.line,
      risk: item.kind === 'public_sensitive_env'
        ? 'Public env variables are bundled into client code and can expose credentials.'
        : 'A provider token or API key pattern appears in a committed file.',
      recommendation: item.kind === 'public_sensitive_env'
        ? 'Move this value to server-only env unless it is a publishable key and add it to the explicit allowlist.'
        : 'Remove the literal, rotate the credential if real, and replace it with a placeholder.',
      evidence: { kind: item.kind, name: item.name, snippet: item.snippet },
    }))

  return { items, findings }
}

export function inspectEnvSecrets(file: string, source: string): EnvSecretInventoryItem[] {
  const items: EnvSecretInventoryItem[] = []
  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    const name = match[1]
    items.push({
      file,
      line: lineNumberForOffset(source, match.index ?? 0),
      name,
      kind: 'env_reference',
      snippet: safeSnippet(match[0]),
      risk: 'low',
    })
  }

  for (const match of source.matchAll(PUBLIC_ENV_SENSITIVE)) {
    const name = match[0]
    if (PUBLIC_ENV_ALLOWLIST.has(name)) continue
    items.push({
      file,
      line: lineNumberForOffset(source, match.index ?? 0),
      name,
      kind: 'public_sensitive_env',
      snippet: safeSnippet(name),
      risk: publicEnvRisk(file, name),
    })
  }

  for (const pattern of SECRET_LITERAL_PATTERNS) {
    for (const match of source.matchAll(pattern.pattern)) {
      const matched = match[0]
      const risk = isLikelyPlaceholderSecret(file, matched) ? 'low' : pattern.risk
      items.push({
        file,
        line: lineNumberForOffset(source, match.index ?? 0),
        name: pattern.name,
        kind: 'literal_secret_pattern',
        snippet: redactSecret(matched),
        risk,
      })
    }
  }

  return items
}

function safeSnippet(value: string): string {
  return value.length > 160 ? `${value.slice(0, 157)}...` : value
}

function redactSecret(value: string): string {
  if (value.length <= 12) return '<redacted>'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function isLikelyPlaceholderSecret(file: string, value: string): boolean {
  const lowerFile = file.toLowerCase()
  const lowerValue = value.toLowerCase()
  if (/\b(__tests__|\.test\.|\.spec\.|fixtures?|mock|example|docs?|generated)\b/.test(lowerFile)) return true
  if (/test|fake|mock|dummy|example|placeholder|sample|fixture|1234|abcdef|wxyz|token|value|prompt-state|protected|protector/.test(lowerValue)) return true
  return false
}

function publicEnvRisk(file: string, name: string): EnvSecretInventoryItem['risk'] {
  const lowerFile = file.toLowerCase()
  if (lowerFile.startsWith('scripts/audit/')) return 'low'
  if (/\b(__tests__|\.test\.|\.spec\.|fixtures?|mock|example|docs?)\b/.test(lowerFile)) return 'low'
  if (/(SECRET|TOKEN|PASSWORD|SERVICE_ROLE|API_KEY)/.test(name)) return 'high'
  if (/^NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN$/.test(name)) return 'high'
  return 'medium'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildEnvSecretInventory(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
