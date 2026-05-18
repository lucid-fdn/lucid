import crypto from 'node:crypto'

const EXTERNAL_KNOWLEDGE_TOKEN_PREFIX = 'lkc_'

export function generateExternalKnowledgeToken(): string {
  return `${EXTERNAL_KNOWLEDGE_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
}

export function hashExternalKnowledgeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function redactExternalKnowledgeToken(token: string | null | undefined): string {
  if (!token) return '<token>'
  if (token.length <= 12) return '<redacted>'
  return `${token.slice(0, 7)}...${token.slice(-4)}`
}

export function isExternalKnowledgeToken(value: string): boolean {
  return value.startsWith(EXTERNAL_KNOWLEDGE_TOKEN_PREFIX) && value.length > EXTERNAL_KNOWLEDGE_TOKEN_PREFIX.length + 24
}
