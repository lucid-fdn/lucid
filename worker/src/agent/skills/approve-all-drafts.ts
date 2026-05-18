#!/usr/bin/env tsx
/**
 * Bulk-approve all draft skills in skill_catalog.
 *
 * Usage:
 *   npx tsx worker/src/agent/skills/approve-all-drafts.ts [--dry-run]
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[approve] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch all draft skills
  const { data: drafts, error: fetchErr } = await supabase
    .from('skill_catalog')
    .select('id, slug, name, content_chars, import_warnings')
    .eq('status', 'draft')
    .order('slug')

  if (fetchErr) {
    console.error('[approve] ERROR fetching drafts:', fetchErr.message)
    process.exit(1)
  }

  if (!drafts || drafts.length === 0) {
    console.log('[approve] No draft skills found — nothing to approve.')
    return
  }

  console.log(`[approve] Found ${drafts.length} draft skills`)

  if (dryRun) {
    console.log('\n=== DRY RUN (no DB writes) ===')
    for (const s of drafts) {
      const warns = Array.isArray(s.import_warnings) ? s.import_warnings.length : 0
      console.log(`  ${s.slug} (${s.content_chars} chars)${warns > 0 ? ` [${warns} warnings]` : ''}`)
    }
    return
  }

  // Approve each one individually so we get per-skill error reporting
  let approved = 0
  let failed = 0
  for (const skill of drafts) {
    const { error } = await supabase
      .from('skill_catalog')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', skill.id)

    if (error) {
      console.error(`  FAIL: ${skill.slug} — ${error.message}`)
      failed++
    } else {
      console.log(`  OK: ${skill.slug}`)
      approved++
    }
  }

  console.log(`\n=== APPROVE COMPLETE ===`)
  console.log(`Approved: ${approved}`)
  console.log(`Failed: ${failed}`)
}

main().catch(err => {
  console.error('[approve] Fatal error:', err)
  process.exit(1)
})
