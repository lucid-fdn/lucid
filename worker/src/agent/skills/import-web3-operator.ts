#!/usr/bin/env tsx
/**
 * Import the web3-operator skill into skill_catalog as approved.
 *
 * Usage:
 *   npx tsx worker/src/agent/skills/import-web3-operator.ts [--dry-run]
 *
 * Reads docs/SKILL.md + docs/references/ from a lucid-plugins plugin dir.
 * and upserts into skill_catalog with status='approved'.
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { sanitizeContent, validateFrontmatter, scanForPromptInjection } from './sanitize.js'
import yaml from 'js-yaml'

const dryRun = process.argv.includes('--dry-run')

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
  // Accept optional path arg: npx tsx import-web3-operator.ts [path-to-plugin-dir]
  // Default: looks for lucid-plugins repo as sibling of LucidMerged
  const projectRoot = path.resolve(import.meta.dirname, '../../../../')
  const customPath = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1])
  const skillDir = customPath
    ? path.resolve(customPath)
    : path.join(projectRoot, '..', 'lucid-plugins', 'lucid-trade', 'skill')
  const skillFile = path.join(skillDir, 'SKILL.md')

  if (!fs.existsSync(skillFile)) {
    console.error(`[web3-operator] SKILL.md not found at ${skillFile}`)
    process.exit(1)
  }

  // Read main SKILL.md
  let rawContent = fs.readFileSync(skillFile, 'utf-8')

  // Inline references into the skill content
  const refsDir = path.join(skillDir, 'references')
  if (!fs.existsSync(refsDir)) {
    // Try docs/references/ convention (lucid-plugins repo structure)
    const altRefsDir = path.join(skillDir, '..', 'docs', 'references')
    if (fs.existsSync(altRefsDir)) {
      // refsDir stays as-is, handled below
    }
  }
  if (fs.existsSync(refsDir)) {
    const refFiles = fs.readdirSync(refsDir).filter(f => f.endsWith('.md')).sort()
    if (refFiles.length > 0) {
      rawContent += '\n\n---\n\n# References\n\n'
      for (const refFile of refFiles) {
        const refContent = fs.readFileSync(path.join(refsDir, refFile), 'utf-8')
        rawContent += refContent + '\n\n'
      }
    }
  }

  const { frontmatter, body } = parseFrontmatter(rawContent)

  const validation = validateFrontmatter(frontmatter)
  if (!validation.valid) {
    console.error(`[web3-operator] Frontmatter validation failed: ${validation.error}`)
    process.exit(1)
  }

  const sanitizedContent = sanitizeContent(body)
  const injectionWarnings = scanForPromptInjection(sanitizedContent)
  const allWarnings = [...validation.warnings, ...injectionWarnings]
  const contentHash = createHash('sha256').update(rawContent).digest('hex')

  console.log(`[web3-operator] Skill content: ${sanitizedContent.length} chars`)
  console.log(`[web3-operator] References inlined: ${fs.existsSync(refsDir) ? fs.readdirSync(refsDir).filter(f => f.endsWith('.md')).length : 0} files`)

  if (allWarnings.length > 0) {
    console.log(`[web3-operator] Warnings: ${allWarnings.length}`)
    for (const w of allWarnings) {
      console.log(`  - ${w.severity}: ${w.pattern} (line ${w.line})`)
    }
  }

  if (dryRun) {
    console.log('[web3-operator] DRY RUN — no changes made')
    console.log(`\nSkill preview (first 500 chars):\n${sanitizedContent.slice(0, 500)}...`)
    return
  }

  // Connect to Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[web3-operator] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Check existing
  const { data: existing } = await supabase
    .from('skill_catalog')
    .select('id, content_hash')
    .eq('slug', 'web3-operator')
    .single()

  if (existing && existing.content_hash === contentHash) {
    console.log('[web3-operator] UNCHANGED — content hash matches')
    return
  }

  const row = {
    slug: 'web3-operator',
    name: frontmatter.name as string,
    description: (frontmatter.description as string) || '',
    raw_content: rawContent,
    sanitized_content: sanitizedContent,
    frontmatter,
    source: 'manual',
    source_path: path.relative(projectRoot, skillFile).replace(/\\/g, '/'),
    source_commit: null,
    content_hash: contentHash,
    status: 'approved',
    content_chars: sanitizedContent.length,
    import_warnings: allWarnings.length > 0 ? allWarnings : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('skill_catalog')
    .upsert(row, { onConflict: 'slug' })

  if (error) {
    console.error(`[web3-operator] FAIL: ${error.message}`)
    process.exit(1)
  }

  console.log(`[web3-operator] OK — ${existing ? 'updated' : 'created'} (${sanitizedContent.length} chars, approved)`)
}

main().catch(err => {
  console.error('[web3-operator] Fatal error:', err)
  process.exit(1)
})
