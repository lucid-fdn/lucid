#!/usr/bin/env tsx
/**
 * Import a skill from a lucid-plugins plugin into skill_catalog.
 *
 * Usage:
 *   npx tsx worker/src/agent/skills/import-lucid-skill.ts <skill-dir> [--dry-run] [--approve]
 *
 * Example:
 *   npx tsx worker/src/agent/skills/import-lucid-skill.ts ../lucid-plugins/lucid-trade/skill
 *   npx tsx worker/src/agent/skills/import-lucid-skill.ts ../lucid-plugins/lucid-trade/skill --approve
 *
 * Reads SKILL.md (+ references/*.md inline) from a lucid-plugins skill dir.
 * and upserts into skill_catalog. Default status='draft', use --approve for 'approved'.
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env or environment)
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { sanitizeContent, validateFrontmatter, scanForPromptInjection } from './sanitize.js'
import yaml from 'js-yaml'

const dryRun = process.argv.includes('--dry-run')
const autoApprove = process.argv.includes('--approve')

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }
  try {
    const parsed = yaml.load(match[1])
    const frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? parsed as Record<string, unknown>
      : {}
    return { frontmatter, body: match[2] }
  } catch {
    return { frontmatter: {}, body: raw }
  }
}

async function main() {
  // Find plugin dir argument (first non-flag arg after script path)
  const pluginDir = process.argv.find((a, i) => i >= 2 && !a.startsWith('-'))
  if (!pluginDir) {
    console.error('Usage: import-lucid-skill.ts <plugin-dir> [--dry-run] [--approve]')
    process.exit(1)
  }

  const resolved = path.resolve(pluginDir)
  const skillFile = path.join(resolved, 'SKILL.md')

  if (!fs.existsSync(skillFile)) {
    console.error(`[import] SKILL.md not found at ${skillFile}`)
    process.exit(1)
  }

  // Read plugin.json for metadata
  let pluginMeta: Record<string, unknown> = {}
  const pluginJsonPath = path.join(resolved, 'plugin.json')
  if (fs.existsSync(pluginJsonPath)) {
    pluginMeta = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'))
  }

  // Read main SKILL.md
  let rawContent = fs.readFileSync(skillFile, 'utf-8')

  // Inline references
  const refsDir = path.join(resolved, 'references')
  if (fs.existsSync(refsDir)) {
    const refDirs = fs.readdirSync(refsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const dir of refDirs) {
      const refSkill = path.join(refsDir, dir.name, 'SKILL.md')
      if (fs.existsSync(refSkill)) {
        const refContent = fs.readFileSync(refSkill, 'utf-8')
        const { body } = parseFrontmatter(refContent)
        rawContent += `\n\n${body}`
      }
      // Also inline reference .md files
      const refFiles = fs.readdirSync(path.join(refsDir, dir.name))
        .filter(f => f.endsWith('.md') && f !== 'SKILL.md')
        .sort()
      for (const rf of refFiles) {
        const refContent = fs.readFileSync(path.join(refsDir, dir.name, rf), 'utf-8')
        rawContent += `\n\n${refContent}`
      }
    }
  }

  const { frontmatter, body } = parseFrontmatter(rawContent)
  const slug = (frontmatter.name as string) || (pluginMeta.id as string) || path.basename(resolved)
  const name = (pluginMeta.name as string) || slug
  const description = (frontmatter.description as string) || (pluginMeta.description as string) || ''

  const sanitizedContent = sanitizeContent(body)
  const contentHash = createHash('sha256').update(rawContent).digest('hex')
  const warnings = scanForPromptInjection(sanitizedContent)
  const status = autoApprove ? 'approved' : 'draft'

  console.log(`[import] ${slug} — ${sanitizedContent.length} chars, ${warnings.length} warnings, status=${status}`)
  if (warnings.length > 0) console.log(`[import] Warnings: ${warnings.join(', ')}`)

  if (dryRun) {
    console.log('[import] DRY RUN — skipping DB upsert')
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[import] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { error } = await supabase
    .from('skill_catalog')
    .upsert({
      slug,
      name,
      description,
      raw_content: rawContent,
      sanitized_content: sanitizedContent,
      frontmatter,
      source: 'manual',
      source_path: `skills/${path.basename(resolved)}/SKILL.md`,
      content_hash: contentHash,
      status,
      content_chars: sanitizedContent.length,
      import_warnings: warnings.length > 0 ? warnings : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'slug' })

  if (error) {
    console.error(`[import] DB error: ${error.message}`)
    process.exit(1)
  }

  console.log(`[import] ✓ ${slug} upserted (${sanitizedContent.length} chars, status=${status})`)
}

main().catch(err => {
  console.error('[import] Fatal:', err)
  process.exit(1)
})
