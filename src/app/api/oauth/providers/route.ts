/**
 * OAuth Providers API Route
 *
 * Returns available OAuth integrations. Primary source: plugin_catalog DB (same
 * as unified skills page). Falls back to Nango's /integrations API if DB is empty.
 *
 * Security:
 *   - Public endpoint (no auth required — provider list is not sensitive)
 *   - Timeout protected (15s on Nango fallback)
 */

import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getPluginCatalogByKind } from '@/lib/db/plugins'
import { nangoBackendFetch } from '@/lib/oauth/nango-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY

interface NangoIntegration {
  unique_key: string
  provider: string
  display_name: string
  logo?: string
}

/** Map Nango provider keys to user-friendly descriptions */
const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  google: 'Connect your Google account (Sheets, Calendar, Drive)',
  notion: 'Connect your Notion workspace',
  slack: 'Connect your Slack workspace',
  github: 'Connect your GitHub account',
  'twitter-v2': 'Connect your X account',
  hubspot: 'Connect your HubSpot CRM',
  'google-sheets': 'Connect Google Sheets',
  'google-calendar': 'Connect Google Calendar',
}

/**
 * GET /api/oauth/providers
 *
 * Primary: plugin_catalog DB (kind='integration').
 * Fallback: Nango /integrations API (if DB returns nothing).
 */
export async function GET(_request: NextRequest) {
  try {
    // Primary: DB (same source as unified skills page)
    const integrations = await getPluginCatalogByKind(['integration'])

    if (integrations.length > 0) {
      const providers = integrations.map((entry) => ({
        id: entry.auth_provider ?? entry.slug,
        name: entry.name,
        description: entry.description,
        icon: null,
        provider: entry.auth_provider ?? entry.slug,
        slug: entry.slug,
      }))
      return NextResponse.json({ providers })
    }

    // Fallback: Nango API (in case DB has no integrations seeded)
    if (!NANGO_SECRET_KEY) {
      return NextResponse.json({ providers: [] })
    }

    const result = await nangoBackendFetch<{ data: NangoIntegration[] }>('/integrations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${NANGO_SECRET_KEY}` },
      label: 'list-integrations',
      timeoutMs: 15_000,
      maxRetries: 2,
    })

    if (!result.ok) {
      console.error('[OAuth Providers API] Nango integrations error:', result.status)
      return NextResponse.json({ providers: [] })
    }

    const nangoIntegrations = result.data?.data ?? []
    const providers = nangoIntegrations.map((integration) => ({
      id: integration.unique_key,
      name: integration.display_name || integration.unique_key,
      description: PROVIDER_DESCRIPTIONS[integration.unique_key] || `Connect ${integration.display_name || integration.unique_key}`,
      icon: integration.logo || null,
      provider: integration.provider,
    }))

    return NextResponse.json({ providers })
  } catch (error) {
    console.error('[OAuth Providers API] Error:', error)
    return NextResponse.json({ providers: [] })
  }
}
