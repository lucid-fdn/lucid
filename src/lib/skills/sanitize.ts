export interface ImportWarning {
  pattern: string
  line: number
  snippet: string
  severity: 'high' | 'medium' | 'low'
}

const KNOWN_FIELDS = new Set([
  'name', 'description', 'user-invocable', 'disable-model-invocation',
  'always', 'emoji', 'homepage', 'skillKey', 'primaryEnv', 'os',
  'requires', 'install', 'command-dispatch', 'command-tool', 'command-arg-mode',
  'slug', 'metadata', 'allowed-tools',
  'category', 'tags',
])

const FIELD_LIMITS: Record<string, number> = {
  name: 120,
  description: 1000,
  homepage: 2048,
  emoji: 10,
}

const ARRAY_MAX_ITEMS = 50

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous/i,
  /you\s+are\s+now/i,
  /<\/?system>/i,
  /##\s+System\s+Prompt/i,
  /forget\s+(all\s+)?instructions/i,
  /\bdisregard\b/i,
  /override\s.*instructions/i,
]

export function sanitizeSkillContent(raw: string): string {
  let content = raw
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  content = content.split('\n').map(line => line.trimEnd()).join('\n')
  content = content.replace(/\n+$/, '\n')
  if (!content.endsWith('\n')) content += '\n'
  return content
}

export function validateSkillFrontmatter(fm: Record<string, unknown>) {
  const warnings: ImportWarning[] = []

  if (!fm.name || typeof fm.name !== 'string') {
    return { valid: false, error: 'Missing required field: name', warnings }
  }
  if (!fm.description || typeof fm.description !== 'string') {
    return { valid: false, error: 'Missing required field: description', warnings }
  }

  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (typeof fm[field] === 'string' && (fm[field] as string).length > limit) {
      return { valid: false, error: `Field "${field}" exceeds ${limit} char limit`, warnings }
    }
  }

  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val) && val.length > ARRAY_MAX_ITEMS) {
      return { valid: false, error: `Array field "${key}" exceeds ${ARRAY_MAX_ITEMS} items`, warnings }
    }
  }

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

export function scanSkillForPromptInjection(content: string): ImportWarning[] {
  const warnings: ImportWarning[] = []
  const lines = content.split('\n')
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (line.trimStart().startsWith('>')) continue

    const proseOnly = line.replace(/`[^`]*`/g, '')
    for (const pattern of INJECTION_PATTERNS) {
      const match = proseOnly.match(pattern)
      if (match) {
        const startIdx = Math.max(0, (match.index ?? 0) - 10)
        warnings.push({
          pattern: pattern.source,
          line: i + 1,
          snippet: line.slice(startIdx, startIdx + 50),
          severity: 'high',
        })
      }
    }
  }

  return warnings
}
