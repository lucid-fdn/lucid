#!/usr/bin/env npx tsx
/**
 * Seed every first-party product template into lucid_packs.
 *
 * This is the converged template seed. Active product surfaces read Lucid
 * Pack-backed templates only.
 *
 * Run:
 *   npm run templates:seed -- --dry-run
 *   npm run templates:seed
 */
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: false })

import { createServiceClient } from '@/lib/supabase/server'
import { assertLucidPackManifestSafe } from '@/lib/packs'
import { PLATFORM_TEMPLATE_PACKS } from './catalog'

const dryRun = process.argv.includes('--dry-run')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function seed() {
  console.log(`${dryRun ? 'Planning' : 'Seeding'} ${PLATFORM_TEMPLATE_PACKS.length} template packs into lucid_packs\n`)

  if (!dryRun && (!url || !key)) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = dryRun ? null : createServiceClient()
  let failed = 0
  for (const manifest of PLATFORM_TEMPLATE_PACKS) {
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
      console.log(`• ${manifest.key} v${manifest.version} (${manifest.metadata.template_type}, ${manifest.resources.length} resources)`)
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
    console.error(`\n${failed}/${PLATFORM_TEMPLATE_PACKS.length} template pack seed(s) failed.`)
    process.exit(1)
  }

  console.log('\nDone.')
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
