/**
 * OAuth Resources API Route
 *
 * Fetches dynamic resources from OAuth providers (Twitter lists, Slack channels, etc.)
 * via Nango proxy with the user's OAuth token.
 *
 * Security:
 *   - Rate limited (30/min per user)
 *   - Timeout protected (30s per provider call)
 *   - Retry with backoff on 429/5xx
 *
 * GET /api/oauth/:provider/resources/:resource?connectionId=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'
import { nangoProxyFetch } from '@/lib/oauth/nango-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Resource fetcher registry
// ---------------------------------------------------------------------------

type ResourceOption = { name: string; value: string }

interface FetcherConfig {
  endpoint: string
  providerConfigKey: string
  method?: 'GET' | 'POST'
  body?: unknown
  extraHeaders?: Record<string, string>
  transform: (data: Record<string, unknown>) => ResourceOption[]
}

const RESOURCE_FETCHERS: Record<string, Record<string, FetcherConfig>> = {
  twitter: {
    lists: {
      endpoint: '2/users/me/owned_lists',
      providerConfigKey: 'twitter',
      transform: (data) =>
        ((data.data as { id: string; name: string }[]) || []).map((l) => ({ name: l.name, value: l.id })),
    },
  },
  slack: {
    channels: {
      endpoint: 'conversations.list?types=public_channel,private_channel',
      providerConfigKey: 'slack',
      transform: (data) =>
        ((data.channels as { id: string; name: string }[]) || []).map((c) => ({ name: `#${c.name}`, value: c.id })),
    },
  },
  'google-sheets': {
    spreadsheets: {
      endpoint: "drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'",
      providerConfigKey: 'google-sheets',
      transform: (data) =>
        ((data.files as { id: string; name: string }[]) || []).map((f) => ({ name: f.name, value: f.id })),
    },
  },
  notion: {
    databases: {
      endpoint: 'v1/search',
      providerConfigKey: 'notion',
      method: 'POST',
      body: { filter: { property: 'object', value: 'database' } },
      extraHeaders: { 'Notion-Version': '2022-06-28' },
      transform: (data) =>
        ((data.results as { id: string; title?: { plain_text: string }[] }[]) || []).map((db) => ({
          name: db.title?.[0]?.plain_text || 'Untitled',
          value: db.id,
        })),
    },
  },
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string; resource: string }> },
) {
  try {
    const { provider, resource } = await params
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Missing connectionId parameter' }, { status: 400 })
    }

    // Auth + rate limit
    const userId = await requireUserId()
    const rl = await checkRateLimit(`oauth:resources:${userId}`, OAuthRateLimits.RESOURCES)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests', options: [] },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    // Lookup fetcher config
    const fetcher = RESOURCE_FETCHERS[provider]?.[resource]
    if (!fetcher) {
      return NextResponse.json(
        { error: `Resource "${resource}" not supported for provider "${provider}"`, options: [] },
        { status: 200 }, // 200 so UI gracefully degrades to manual input
      )
    }

    // Call provider API via Nango proxy (with timeout + retry)
    const result = await nangoProxyFetch<Record<string, unknown>>(fetcher.endpoint, {
      connectionId,
      providerConfigKey: fetcher.providerConfigKey,
      method: fetcher.method || 'GET',
      body: fetcher.body,
      extraHeaders: fetcher.extraHeaders,
      label: `resources-${provider}-${resource}`,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: `Failed to fetch ${resource} from ${provider}: ${result.status}`, options: [] },
        { status: 200 },
      )
    }

    const options = fetcher.transform(result.data)
    return NextResponse.json({ options })
  } catch (error) {
    console.error('[OAuth Resources] Error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch resources',
        options: [],
      },
      { status: 200 },
    )
  }
}
