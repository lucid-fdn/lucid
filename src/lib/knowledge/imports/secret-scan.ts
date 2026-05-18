import type { KnowledgeImportRedaction } from './types'

interface SecretPattern {
  type: string
  label: string
  pattern: RegExp
  replacement: string
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    type: 'private_key',
    label: 'Private key block',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    type: 'authorization_header',
    label: 'Authorization bearer token',
    pattern: /(authorization\s*:\s*bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
    replacement: '$1[REDACTED_TOKEN]',
  },
  {
    type: 'cookie_header',
    label: 'Cookie header',
    pattern: /(cookie\s*:\s*)[^\n\r]{12,}/gi,
    replacement: '$1[REDACTED_COOKIE]',
  },
  {
    type: 'openai_key',
    label: 'OpenAI API key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    replacement: '[REDACTED_OPENAI_KEY]',
  },
  {
    type: 'stripe_key',
    label: 'Stripe API key',
    pattern: /\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]{20,}\b/g,
    replacement: '[REDACTED_STRIPE_KEY]',
  },
  {
    type: 'jwt',
    label: 'JWT token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_JWT]',
  },
  {
    type: 'npm_token',
    label: 'npm token',
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g,
    replacement: '[REDACTED_NPM_TOKEN]',
  },
  {
    type: 'google_api_key',
    label: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replacement: '[REDACTED_GOOGLE_API_KEY]',
  },
  {
    type: 'slack_token',
    label: 'Slack token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
  {
    type: 'github_token',
    label: 'GitHub token',
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    type: 'aws_access_key',
    label: 'AWS access key',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
  },
  {
    type: 'named_secret',
    label: 'Named secret value',
    pattern: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}["']?/gi,
    replacement: '$1=[REDACTED_SECRET]',
  },
]

export function redactKnowledgeImportSecrets(content: string): {
  content: string
  redactions: KnowledgeImportRedaction[]
} {
  let redacted = content
  const redactions: KnowledgeImportRedaction[] = []

  for (const secretPattern of SECRET_PATTERNS) {
    redacted = redacted.replace(secretPattern.pattern, (...args: unknown[]) => {
      const match = String(args[0])
      const offset = Number(args[args.length - 2] ?? 0)
      redactions.push({
        type: secretPattern.type,
        label: secretPattern.label,
        start: offset,
        end: offset + match.length,
        replacement: normalizeReplacement(secretPattern.replacement),
      })
      return applyReplacement(secretPattern.replacement, args)
    })
  }

  return { content: redacted, redactions }
}

function normalizeReplacement(replacement: string): string {
  return replacement.replace(/\$\d+/g, '')
}

function applyReplacement(replacement: string, args: unknown[]): string {
  return replacement.replace(/\$(\d+)/g, (_, groupIndex: string) => {
    const index = Number.parseInt(groupIndex, 10)
    return typeof args[index] === 'string' ? String(args[index]) : ''
  })
}
