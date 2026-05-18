#!/usr/bin/env npx tsx
/**
 * Seed platform capability templates into lucid_packs.
 *
 * Run:
 *   npm run capability-templates:seed -- --dry-run
 *   npm run capability-templates:seed
 *
 * Requires for live writes:
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config'

import { createServiceClient } from '@/lib/supabase/server'
import { assertLucidPackManifestSafe } from '@/lib/packs'
import { WEB3_CAPABILITY_TEMPLATES } from '../catalog'

const dryRun = process.argv.includes('--dry-run')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function seed() {
  console.log(`${dryRun ? 'Planning' : 'Seeding'} ${WEB3_CAPABILITY_TEMPLATES.length} capability templates into lucid_packs\n`)

  if (!dryRun && (!url || !key)) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = dryRun ? null : createServiceClient()
  let failed = 0
  for (const manifest of WEB3_CAPABILITY_TEMPLATES) {
    assertLucidPackManifestSafe(manifest)
    const row = {
      org_id: null,
      pack_key: manifest.key,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      manifest,
      status: 'active',
    }

    if (dryRun) {
      console.log(`• ${manifest.key} v${manifest.version} (${manifest.resources.length} resources)`)
      continue
    }

    const { data: existing, error: lookupError } = await supabase!
      .from('lucid_packs')
      .select('id')
      .is('org_id', null)
      .eq('pack_key', manifest.key)
      .eq('version', manifest.version)
      .maybeSingle()

    if (lookupError) {
      console.error(`✗ ${manifest.key}: ${lookupError.message}`)
      failed += 1
      continue
    }

    const write = existing?.id
      ? supabase!.from('lucid_packs').update(row).eq('id', existing.id)
      : supabase!.from('lucid_packs').insert(row)
    const { error: writeError } = await write

    if (writeError) {
      console.error(`✗ ${manifest.key}: ${writeError.message}`)
      failed += 1
    } else {
      console.log(`✓ ${manifest.key}`)
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${WEB3_CAPABILITY_TEMPLATES.length} capability template seed(s) failed.`)
    process.exit(1)
  }

  console.log('\nDone.')
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
