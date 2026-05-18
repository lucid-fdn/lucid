#!/usr/bin/env tsx
/**
 * Import OpenClaw ecosystem skills from vendored SKILL.md files into skill_catalog.
 *
 * Usage:
 *   npx tsx worker/src/agent/skills/import-openclaw-skills.ts [--dry-run]
 *
 * Scans packages/openclaw-core/ for SKILL.md files, validates, sanitizes,
 * and upserts into the skill_catalog table as status='draft'.
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { sanitizeContent, validateFrontmatter, scanForPromptInjection, deriveSlug } from './sanitize.js'
import type { ParsedSkill } from './types.js'

const MAX_SKILL_FILE_BYTES = 256 * 1024

// ── YAML frontmatter parser (uses js-yaml for proper nested object support) ─
import yaml from 'js-yaml'

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
    console.warn('[import] YAML parse error in frontmatter')
    return { frontmatter: {}, body: raw }
  }
}

// ── File scanning ───────────────────────────────────────────────────────

export function scanSkillFiles(openclawDir: string): string[] {
  const results: string[] = []
  const patterns = [
    // extensions/{ext}/skills/{name}/SKILL.md
    path.join(openclawDir, 'extensions'),
    // skills/{name}/SKILL.md
    path.join(openclawDir, 'skills'),
  ]

  for (const base of patterns) {
    if (!fs.existsSync(base)) continue
    findSkillMdFiles(base, results)
  }

  return results
}

function findSkillMdFiles(dir: string, results: string[], depth = 0): void {
  if (depth > 4) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === 'SKILL.md') {
      results.push(fullPath)
    } else if (entry.isDirectory()) {
      findSkillMdFiles(fullPath, results, depth + 1)
    }
  }
}

// ── File parsing ────────────────────────────────────────────────────────

export function parseSkillFile(
  filePath: string,
  openclawRoot: string,
): ParsedSkill | null {
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_SKILL_FILE_BYTES) {
    console.warn(`[import] SKIP: ${filePath} exceeds ${MAX_SKILL_FILE_BYTES} bytes`)
    return null
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8')
  const { frontmatter, body } = parseFrontmatter(rawContent)

  // Derive relative path from openclaw root
  const relativePath = path.relative(openclawRoot, filePath).replace(/\\/g, '/')

  // Derive slug
  const slug = deriveSlug(relativePath, frontmatter)

  // Validate frontmatter
  const validation = validateFrontmatter(frontmatter)
  if (!validation.valid) {
    console.warn(`[import] SKIP: ${relativePath} — ${validation.error}`)
    return null
  }

  // Sanitize content
  const sanitizedContent = sanitizeContent(body)

  // Scan for prompt injection
  const injectionWarnings = scanForPromptInjection(sanitizedContent)
  const allWarnings = [...validation.warnings, ...injectionWarnings]

  // Compute hash
  const contentHash = createHash('sha256').update(rawContent).digest('hex')

  return {
    slug,
    name: frontmatter.name as string,
    description: (frontmatter.description as string) || '',
    rawContent,
    sanitizedContent,
    frontmatter,
    contentHash,
    contentChars: sanitizedContent.length,
    warnings: allWarnings,
    sourcePath: relativePath,
  }
}

// ── Change classification (exported for testing) ────────────────────────

export function classifySkillChange(
  existingHash: string | undefined,
  newHash: string,
): 'new' | 'changed' | 'unchanged' {
  if (!existingHash) return 'new'
  if (existingHash === newHash) return 'unchanged'
  return 'changed'
}

// ── Repo root detection ─────────────────────────────────────────────────

function findRepoRoot(): string {
  // Walk upward from this file's directory until we find packages/openclaw-core
  let dir = path.resolve(import.meta.dirname || __dirname, '..', '..', '..', '..')
  // Also try cwd-based detection as fallback
  for (const candidate of [dir, process.cwd(), path.resolve(process.cwd(), '..')]) {
    if (fs.existsSync(path.join(candidate, 'packages', 'openclaw-core'))) {
      return candidate
    }
  }
  // Last resort
  return process.cwd()
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const repoRoot = findRepoRoot()
  const openclawRoot = path.join(repoRoot, 'packages', 'openclaw-core')

  if (!fs.existsSync(openclawRoot)) {
    console.error(`[import] ERROR: packages/openclaw-core not found at ${openclawRoot}`)
    process.exit(1)
  }

  // Get current repo commit (not upstream openclaw commit)
  let sourceCommit = ''
  try {
    sourceCommit = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim()
  } catch { /* non-fatal */ }

  console.log(`[import] Scanning ${openclawRoot}...`)
  const files = scanSkillFiles(openclawRoot)
  console.log(`[import] Found ${files.length} SKILL.md files`)

  const parsed: ParsedSkill[] = []
  let skipped = 0
  for (const file of files) {
    const result = parseSkillFile(file, openclawRoot)
    if (result) parsed.push(result)
    else skipped++
  }

  // Check for slug collisions
  const slugMap = new Map<string, string>()
  for (const skill of parsed) {
    if (slugMap.has(skill.slug)) {
      console.error(`[import] COLLISION: slug "${skill.slug}" from ${skill.sourcePath} and ${slugMap.get(skill.slug)}`)
      process.exit(1)
    }
    slugMap.set(skill.slug, skill.sourcePath)
  }

  if (dryRun) {
    console.log('\n=== DRY RUN (no DB writes) ===')
    console.log(`Parsed: ${parsed.length}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Flagged: ${parsed.filter(s => s.warnings.length > 0).length}`)
    for (const s of parsed) {
      const flags = s.warnings.length > 0 ? ` [${s.warnings.length} warnings]` : ''
      console.log(`  ${s.slug} (${s.contentChars} chars)${flags}`)
    }
    return
  }

  // Connect to Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[import] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch existing slugs for change detection
  const { data: existing } = await supabase
    .from('skill_catalog')
    .select('slug, content_hash, source, version')
    .eq('source', 'openclaw')

  const existingMap = new Map((existing ?? []).map(r => [r.slug, { hash: r.content_hash, version: r.version ?? 1 }]))
  const importedSlugs = new Set(parsed.map(s => s.slug))

  let newCount = 0, changedCount = 0, unchangedCount = 0, deprecatedCount = 0

  // Upsert parsed skills
  for (const skill of parsed) {
    const existingEntry = existingMap.get(skill.slug)
    const change = classifySkillChange(existingEntry?.hash, skill.contentHash)

    if (change === 'unchanged') {
      unchangedCount++
      continue
    }

    // Bump version on content change, start at 1 for new skills
    const nextVersion = change === 'changed' ? (existingEntry?.version ?? 1) + 1 : 1

    const row = {
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      raw_content: skill.rawContent,
      sanitized_content: skill.sanitizedContent,
      frontmatter: skill.frontmatter,
      source: 'openclaw',
      source_path: skill.sourcePath,
      source_commit: sourceCommit,
      content_hash: skill.contentHash,
      status: 'draft' as const,
      content_chars: skill.contentChars,
      import_warnings: skill.warnings.length > 0 ? skill.warnings : null,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('skill_catalog')
      .upsert(row, { onConflict: 'slug' })

    if (error) {
      console.error(`[import] ERROR upserting ${skill.slug}: ${error.message}`)
    } else if (change === 'changed') {
      changedCount++
      console.log(`[import] UPDATED: ${skill.slug} v${existingEntry?.version ?? 1} → v${nextVersion}`)
    } else {
      newCount++
    }
  }

  // Mark removed upstream skills as deprecated
  for (const [slug] of existingMap) {
    if (!importedSlugs.has(slug)) {
      await supabase
        .from('skill_catalog')
        .update({ status: 'deprecated', updated_at: new Date().toISOString() })
        .eq('slug', slug)
        .eq('source', 'openclaw')
      deprecatedCount++
    }
  }

  console.log('\n=== IMPORT COMPLETE ===')
  console.log(`New: ${newCount}`)
  console.log(`Changed: ${changedCount}`)
  console.log(`Unchanged: ${unchangedCount}`)
  console.log(`Deprecated: ${deprecatedCount}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Flagged: ${parsed.filter(s => s.warnings.length > 0).length}`)
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('import-openclaw-skills.ts') ||
               process.argv[1]?.endsWith('import-openclaw-skills.js')
if (isMain) {
  main().catch(err => {
    console.error('[import] Fatal error:', err)
    process.exit(1)
  })
}
