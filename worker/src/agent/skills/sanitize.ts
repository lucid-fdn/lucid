import type { ImportWarning } from './types.js'

// ── Known frontmatter fields (from OpenClaw SKILL.md spec) ──────────────
const KNOWN_FIELDS = new Set([
  'name', 'description', 'user-invocable', 'disable-model-invocation',
  'always', 'emoji', 'homepage', 'skillKey', 'primaryEnv', 'os',
  'requires', 'install', 'command-dispatch', 'command-tool', 'command-arg-mode',
  'slug', 'metadata', 'allowed-tools',
])

// Per-field limits
const FIELD_LIMITS: Record<string, number> = {
  name: 120,
  description: 1000,
  homepage: 2048,
  emoji: 10,
}

const ARRAY_MAX_ITEMS = 50

// ── Prompt injection patterns ───────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous/i,
  /you\s+are\s+now/i,
  /<\/?system>/i,
  /##\s+System\s+Prompt/i,
  /forget\s+(all\s+)?instructions/i,
  /\bdisregard\b/i,
  /override\s.*instructions/i,
]

// ── Content sanitization ────────────────────────────────────────────────

export function sanitizeContent(raw: string): string {
  let content = raw
  // Strip BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  // CRLF → LF
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Strip trailing whitespace per line
  content = content.split('\n').map(line => line.trimEnd()).join('\n')
  // Ensure single trailing newline
  content = content.replace(/\n+$/, '\n')
  if (!content.endsWith('\n')) content += '\n'
  return content
}

// ── Frontmatter validation ──────────────────────────────────────────────

export interface FrontmatterResult {
  valid: boolean
  error?: string
  warnings: ImportWarning[]
}

export function validateFrontmatter(fm: Record<string, unknown>): FrontmatterResult {
  const warnings: ImportWarning[] = []

  // Required fields
  if (!fm.name || typeof fm.name !== 'string') {
    return { valid: false, error: 'Missing required field: name', warnings }
  }
  if (!fm.description || typeof fm.description !== 'string') {
    return { valid: false, error: 'Missing required field: description', warnings }
  }

  // Per-field size limits
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (typeof fm[field] === 'string' && (fm[field] as string).length > limit) {
      return { valid: false, error: `Field "${field}" exceeds ${limit} char limit`, warnings }
    }
  }

  // Array field limits
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val) && val.length > ARRAY_MAX_ITEMS) {
      return { valid: false, error: `Array field "${key}" exceeds ${ARRAY_MAX_ITEMS} items`, warnings }
    }
  }

  // Unknown fields: preserve but warn
  for (const key of Object.keys(fm)) {
    if (!KNOWN_FIELDS.has(key)) {
      warnings.push({
        pattern: `Unknown frontmatter field: ${key}`,
        line: 0,
        snippet: `${key}: ${String(fm[key]).slice(0, 50)}`,
        severity: 'low',
      })
    }
  }

  return { valid: true, warnings }
}

// ── Prompt injection scanning ───────────────────────────────────────────

export function scanForPromptInjection(content: string): ImportWarning[] {
  const warnings: ImportWarning[] = []
  const lines = content.split('\n')
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track fenced code block state
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    // Skip blockquotes
    if (line.trimStart().startsWith('>')) continue

    // Strip inline code before scanning
    const proseOnly = line.replace(/`[^`]*`/g, '')

    for (const pattern of INJECTION_PATTERNS) {
      const match = proseOnly.match(pattern)
      if (match) {
        const startIdx = Math.max(0, (match.index ?? 0) - 10)
        const snippet = line.slice(startIdx, startIdx + 50)
        warnings.push({
          pattern: pattern.source,
          line: i + 1,
          snippet,
          severity: 'high',
        })
      }
    }
  }

  return warnings
}

// ── Slug derivation ─────────────────────────────────────────────────────

export function deriveSlug(
  relativePath: string,
  frontmatter: Record<string, unknown>,
): string {
  // Prefer explicit frontmatter slug
  if (typeof frontmatter.slug === 'string' && frontmatter.slug.trim()) {
    return frontmatter.slug.trim()
  }

  // Strip trailing /SKILL.md
  const base = relativePath.replace(/\/SKILL\.md$/i, '')

  // Pattern: extensions/{ext}/skills/{name}
  const extSkillMatch = base.match(/^extensions\/([^/]+)\/skills\/([^/]+)$/)
  if (extSkillMatch) return `${extSkillMatch[1]}-${extSkillMatch[2]}`

  // Pattern: skills/{name}
  const skillMatch = base.match(/^skills\/([^/]+)$/)
  if (skillMatch) return skillMatch[1]

  // Pattern: extensions/{ext} (extension-root skill)
  const extRootMatch = base.match(/^extensions\/([^/]+)$/)
  if (extRootMatch) return extRootMatch[1]

  // Fallback: use full path with slashes replaced
  return base.replace(/\//g, '-')
}
