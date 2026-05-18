/**
 * OAuth Tools Catalog API
 *
 * GET /api/oauth-tools/catalog — Returns the action catalog from DB.
 * Public endpoint (no auth) — catalog metadata is not sensitive.
 * UI fetches this to render available actions per provider.
 *
 * Catalog lives in `oauth_action_catalog` table, seeded by migration.
 * Adding a new provider = INSERT rows into DB. No code changes.
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'
import { rowsToCatalogProviders } from '@contracts/oauth-tools-catalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase.rpc('get_oauth_action_catalog')

  if (error) {
    console.error('[oauth-catalog] Failed to fetch catalog:', error.message)
    return NextResponse.json({ providers: [] }, { status: 500 })
  }

  const providers = rowsToCatalogProviders(data || [])

  return NextResponse.json({ providers }, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
