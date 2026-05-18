// worker/src/agent/skills/types.ts

/**
 * Row returned by the get_assistant_active_skills() RPC.
 * Matches the SQL RETURNS TABLE definition exactly.
 */
export interface ActiveSkillRow {
  skill_slug: string
  skill_name: string
  skill_description: string
  sanitized_content: string
  frontmatter: Record<string, unknown>
  sort_order: number
  content_chars: number
  source_type?: 'internal' | 'mcpgate' | 'imported' | null
  source_version?: string | null
  selection_meta?: ActiveSkillSelectionMeta
}

export type SkillSelectionReason = 'builtin' | 'engine_support'

export interface ActiveSkillSelectionMeta {
  source: 'builtin' | 'catalog'
  reason: SkillSelectionReason
  engine?: string
  support_level?: 'native' | 'portable' | 'adapted' | 'experimental' | 'unsupported'
}

/**
 * Warning produced during skill import (stored in import_warnings JSONB).
 */
export interface ImportWarning {
  pattern: string
  line: number
  snippet: string
  severity: 'high' | 'medium' | 'low'
}

/**
 * Result of validating and sanitizing a single SKILL.md file.
 */
export interface ParsedSkill {
  slug: string
  name: string
  description: string
  rawContent: string
  sanitizedContent: string
  frontmatter: Record<string, unknown>
  contentHash: string
  contentChars: number
  warnings: ImportWarning[]
  sourcePath: string
}

/**
 * Narrowed SkillSnapshot where resolvedSkills is always present (never undefined).
 * Prevents accidental filesystem fallback in OpenClaw runtime.
 */
export interface SafeSkillSnapshot {
  prompt: string
  skills: Array<{ name: string; primaryEnv?: string; requiredEnv?: string[] }>
  resolvedSkills: Array<{
    name: string
    description: string
    filePath: string
    baseDir: string
    source: string
    disableModelInvocation: boolean
  }>
}
