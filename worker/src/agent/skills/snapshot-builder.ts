import type { ActiveSkillRow, SafeSkillSnapshot } from './types.js'
import type { SkillSelectionSummary } from '../adapters/skills/types.js'

const MAX_SKILLS_IN_PROMPT = 150
const MAX_SKILLS_PROMPT_CHARS = 30_000

/**
 * Build a SkillSnapshot from DB rows returned by get_assistant_active_skills().
 *
 * Critical invariant: resolvedSkills is ALWAYS an array (never undefined).
 * When resolvedSkills is undefined, OpenClaw falls back to filesystem scanning
 * (skills-runtime.ts line 12: `!params.skillsSnapshot.resolvedSkills`).
 */
export function buildSkillsSnapshotFromRows(rows: ActiveSkillRow[]): SafeSkillSnapshot {
  if (rows.length === 0) {
    return { prompt: '', skills: [], resolvedSkills: [] }
  }

  // Apply budget: accumulate content_chars, stop at limit
  const budgetRows: ActiveSkillRow[] = []
  let totalChars = 0
  for (const row of rows) {
    if (budgetRows.length >= MAX_SKILLS_IN_PROMPT) break
    if (totalChars + row.content_chars > MAX_SKILLS_PROMPT_CHARS) break
    budgetRows.push(row)
    totalChars += row.content_chars
  }

  // Build resolvedSkills with synthetic paths (read tool is denied in SaaS)
  const resolvedSkills = budgetRows.map(row => ({
    name: row.skill_slug,
    description: row.skill_description || '',
    filePath: `db://skills/${row.skill_slug}`,
    baseDir: 'db://skills',
    source: 'db',
    disableModelInvocation: false,
  }))

  // Build skills metadata array
  const skills = budgetRows.map(row => {
    const fm = row.frontmatter as Record<string, unknown>
    const requires = fm.requires as Record<string, unknown> | undefined
    return {
      name: row.skill_slug,
      primaryEnv: typeof fm.primaryEnv === 'string' ? fm.primaryEnv : undefined,
      requiredEnv: Array.isArray(requires?.env) ? (requires.env as string[]) : undefined,
    }
  })

  // Render inline prompt (custom formatter — NOT formatSkillsForPrompt)
  const prompt = renderInlineSkillsPrompt(budgetRows)

  return { prompt, skills, resolvedSkills }
}

/**
 * Custom inline formatter that renders sanitized_content directly into the prompt.
 * Intentional divergence from OpenClaw's formatSkillsForPrompt() which emits
 * <location> file paths and instructs the LLM to "use the read tool" —
 * neither works in SaaS where the read tool is denied.
 */
export function renderInlineSkillsPrompt(rows: ActiveSkillRow[]): string {
  const skillBlocks = rows.map(row =>
    `<skill name="${row.skill_slug}" description="${escapeXmlAttr(row.skill_description || '')}">\n${row.sanitized_content}</skill>`
  )

  return [
    'The following skills are activated for this assistant. Use the matching skill when the task fits its description.',
    '',
    '<available_skills>',
    ...skillBlocks,
    '</available_skills>',
  ].join('\n')
}

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildMountedSkillSelection(rows: ActiveSkillRow[]): SkillSelectionSummary {
  return {
    selectedCount: rows.length,
    decisions: rows.map((row) => ({
      skillSlug: row.skill_slug,
      source: row.selection_meta?.source ?? 'catalog',
      reason: row.selection_meta?.reason ?? 'engine_support',
      engine: row.selection_meta?.engine,
      supportLevel: row.selection_meta?.support_level,
      sourceType: row.source_type ?? null,
      sourceVersion: row.source_version ?? null,
    })),
  }
}
