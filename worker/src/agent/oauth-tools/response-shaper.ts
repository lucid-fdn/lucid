/**
 * Response Shaper — Provider-specific result compaction for OAuth tool actions.
 *
 * Problem: APIs like Notion return full page objects with rich text, icons,
 * covers, and deep property trees. A workspace search can easily produce
 * 200K+ chars. LLMs don't need all that to decide what to do next.
 *
 * Solution: Compact mode strips results down to essential fields (id, title,
 * summary metadata). The agent can always do a follow-up call for full details
 * on specific items.
 *
 * Architecture:
 *   Action script returns raw API result
 *     → response shaper compacts it (provider-specific)
 *     → bridge returns compact result to OpenClaw
 *     → agent calls get-page/retrieve-page for full details if needed
 */

import { shapeGenericResponse } from './shapers/generic.js'
import { shapeSlackResponse } from './shapers/slack.js'
import { shapeHubSpotResponse } from './shapers/hubspot.js'
import { shapeTwitterResponse } from './shapers/twitter.js'
import { shapeGoogleResponse } from './shapers/google.js'
import { shapeSalesforceResponse } from './shapers/salesforce.js'
import { shapeZendeskResponse } from './shapers/zendesk.js'
import { shapeGitHubResponse } from './shapers/github.js'
import { resolveLocalActionName } from './action-aliases.js'

/* ─── Types ────────────────────────────────────────────── */

export interface ShaperResult {
  shaped: unknown
  originalChars: number
  shapedChars: number
  compacted: boolean
  /** Number of items in the result (for list/search responses) */
  resultCount?: number
  /** Pre-serialized JSON string — avoids re-serialization in the bridge */
  serialized?: string
}

/* ─── Pagination Detection ────────────────────────────── */

/**
 * Detect pagination from raw API response across all known provider patterns.
 */
export function detectPagination(raw: Record<string, unknown>): { has_more: boolean; next_cursor: string | null } {
  // HubSpot
  const paging = raw.paging as Record<string, unknown> | undefined
  if (paging) {
    const next = paging.next as Record<string, unknown> | undefined
    if (next?.after) return { has_more: true, next_cursor: next.after as string }
  }
  // Slack
  const responseMeta = raw.response_metadata as Record<string, unknown> | undefined
  if (responseMeta?.next_cursor && responseMeta.next_cursor !== '') {
    return { has_more: true, next_cursor: responseMeta.next_cursor as string }
  }
  // Google
  if (raw.nextPageToken) return { has_more: true, next_cursor: raw.nextPageToken as string }
  // Twitter
  const meta = raw.meta as Record<string, unknown> | undefined
  if (meta?.next_token) return { has_more: true, next_cursor: meta.next_token as string }
  // Salesforce
  if (raw.done === false && raw.nextRecordsUrl) return { has_more: true, next_cursor: raw.nextRecordsUrl as string }
  // Pipedrive
  const additionalData = raw.additional_data as Record<string, unknown> | undefined
  const pagination = additionalData?.pagination as Record<string, unknown> | undefined
  if (pagination?.more_items_in_collection === true) {
    return { has_more: true, next_cursor: String(pagination.next_start ?? '') }
  }
  // Apollo
  if (raw.pagination != null) {
    const apolloPag = raw.pagination as Record<string, unknown>
    if (apolloPag.has_next_page === true) {
      return { has_more: true, next_cursor: String(apolloPag.page ? Number(apolloPag.page) + 1 : '') }
    }
  }
  // Generic (Notion-style)
  if (raw.has_more === true) return { has_more: true, next_cursor: (raw.next_cursor as string) ?? null }
  return { has_more: false, next_cursor: null }
}

/* ─── Default Page Sizes ───────────────────────────────── */

/**
 * Default page_size for list/search actions when not specified by the agent.
 * Notion API default is 100 — way too many for an LLM context.
 */
const DEFAULT_PAGE_SIZES: Record<string, Record<string, number>> = {
  notion: {
    'search-pages': 10,
    'query-database': 15,
    'list-users': 20,
    'list-comments': 15,
    'retrieve-block-children': 20,
  },
  slack: {
    'list-channels': 20,
    'list-messages': 15,
  },
  google: {
    'list-events': 15,
    'list-files': 15,
  },
  'google-calendar': {
    'list-events': 15,
    'list-upcoming-events': 15,
    'list-calendar-list': 20,
  },
  'google-sheets': {
    'list-spreadsheets': 15,
  },
  twitter: {
    'search-tweets': 10,
    'get-user-tweets': 10,
    'get-mentions': 10,
    'get-followers': 20,
    'get-following': 20,
    'get-bookmarks': 20,
    'get-replies': 20,
    'get-liked-tweets': 20,
    'get-liking-users': 20,
  },
  'twitter-v2': {
    'search-tweets': 10,
    'get-user-tweets': 10,
    'get-mentions': 10,
    'get-followers': 20,
    'get-following': 20,
    'get-bookmarks': 20,
    'get-replies': 20,
    'get-liked-tweets': 20,
    'get-liking-users': 20,
  },
  hubspot: {
    'list-contacts': 15,
    'list-companies': 15,
    'list-deals': 15,
    'list-tickets': 15,
    'search-contacts': 15,
    'search-companies': 15,
    'search-deals': 15,
    'search-tickets': 15,
    'list-marketing-emails': 10,
    'list-forms': 15,
  },
  salesforce: {
    'fetch-fields': 20,
  },
  zendesk: {
    'search-tickets': 15,
    'fetch-articles': 15,
  },
  github: {
    'list-issues': 15,
    'list-pull-requests': 15,
    'list-repos': 15,
  },
  asana: {
    'fetch-projects': 15,
  },
  linear: {
    'fetch-teams': 15,
  },
  gong: {
    'fetch-call-transcripts': 10,
  },
  discord: {
    'list-guilds': 20,
    'list-channels': 20,
    'list-members': 20,
  },
  reddit: {
    'list-posts': 15,
  },
  trello: {
    'list-boards': 15,
    'list-cards': 15,
    'list-lists': 20,
  },
  paypal: {
    'list-transactions': 15,
  },
  typeform: {
    'list-forms': 15,
    'get-form-responses': 15,
  },
  bitly: {
    'list-links': 15,
  },
  instagram: {
    'list-media': 15,
  },
  canva: {
    'list-designs': 15,
  },
  lemlist: {
    'list-campaigns': 15,
    'list-leads': 15,
  },
  facebook: {
    'list-pages': 15,
  },
  whoop: {
    'get-recovery': 10,
    'get-sleep': 10,
    'get-workout': 10,
  },
  amazon: {
    'list-email-templates': 15,
  },
  make: {
    'list-scenarios': 20,
    'list-scenario-logs': 20,
  },
  zapier: {
    'list-zaps': 20,
  },
  pipedrive: {
    'list-deals': 20,
    'list-persons': 20,
    'list-organizations': 20,
    'list-activities': 20,
    'search-items': 20,
  },
  apollo: {
    'search-people': 20,
    'search-organizations': 20,
    'search-contacts': 20,
    'list-sequences': 20,
  },
}

/**
 * Inject default page_size into args if not already provided.
 * Returns a new args object (never mutates).
 */
export function applyDefaultPageSize(
  provider: string,
  actionName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  actionName = resolveLocalActionName(provider, actionName)
  if (args.page_size != null) return args
  const defaults = DEFAULT_PAGE_SIZES[provider]
  const size = defaults?.[actionName]
  if (!size) return args
  return { ...args, page_size: size }
}

/* ─── Notion Compaction ────────────────────────────────── */

/**
 * Extract a plain-text title from a Notion page object.
 * Handles both `properties.title` and `properties.Name` patterns.
 */
function extractNotionTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, unknown> | undefined
  if (!props) return '(untitled)'

  for (const val of Object.values(props)) {
    const prop = val as Record<string, unknown>
    if (prop?.type !== 'title') continue
    const titleArr = prop.title as Array<{ plain_text?: string }> | undefined
    if (Array.isArray(titleArr) && titleArr.length > 0) {
      return titleArr.map(t => t.plain_text ?? '').join('')
    }
  }
  return '(untitled)'
}

/**
 * Extract parent info from a Notion page.
 */
function extractNotionParent(page: Record<string, unknown>): string | null {
  const parent = page.parent as Record<string, unknown> | undefined
  if (!parent) return null
  if (parent.type === 'database_id') return `database:${parent.database_id}`
  if (parent.type === 'workspace') return 'workspace'
  if (parent.type === 'page_id') return `page:${parent.page_id}`
  return null
}

/**
 * Compact a Notion page object to essential fields.
 */
function compactNotionPage(page: Record<string, unknown>): Record<string, unknown> {
  return {
    id: page.id,
    object: page.object,
    title: extractNotionTitle(page),
    url: page.url,
    parent: extractNotionParent(page),
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    archived: page.archived || false,
    icon: (page.icon as Record<string, unknown>)?.type ?? null,
  }
}

/**
 * Compact a Notion user object.
 */
function compactNotionUser(user: Record<string, unknown>): Record<string, unknown> {
  return {
    id: user.id,
    object: user.object,
    name: user.name,
    type: user.type,
    avatar_url: user.avatar_url ?? null,
  }
}

/**
 * Compact a Notion database object.
 */
function compactNotionDatabase(db: Record<string, unknown>): Record<string, unknown> {
  const props = db.properties as Record<string, Record<string, unknown>> | undefined
  return {
    id: db.id,
    object: db.object,
    title: Array.isArray(db.title)
      ? (db.title as Array<{ plain_text?: string }>).map(t => t.plain_text ?? '').join('')
      : '(untitled)',
    url: db.url,
    created_time: db.created_time,
    last_edited_time: db.last_edited_time,
    // Just property names + types, not full schemas
    properties: props
      ? Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.type]))
      : {},
  }
}

/**
 * Compact a Notion block to essential fields.
 */
function compactNotionBlock(block: Record<string, unknown>): Record<string, unknown> {
  const type = block.type as string | undefined
  const compact: Record<string, unknown> = {
    id: block.id,
    type,
    has_children: block.has_children ?? false,
  }
  // Extract plain text from the block's type-specific content
  if (type && block[type]) {
    const content = block[type] as Record<string, unknown>
    if (Array.isArray(content.rich_text)) {
      compact.text = (content.rich_text as Array<{ plain_text?: string }>)
        .map(t => t.plain_text ?? '').join('')
    }
    if (content.url) compact.url = content.url
    if (content.caption && Array.isArray(content.caption)) {
      compact.caption = (content.caption as Array<{ plain_text?: string }>)
        .map(t => t.plain_text ?? '').join('')
    }
  }
  return compact
}

/** Actions that return page objects in results[] */
const NOTION_PAGE_ACTIONS = new Set(['search-pages', 'query-database'])
/** Actions that return user objects in results[] */
const NOTION_USER_ACTIONS = new Set(['list-users'])
/** Actions that return block objects in results[] */
const NOTION_BLOCK_ACTIONS = new Set(['retrieve-block-children'])
/** Actions that return a single database */
const NOTION_DATABASE_ACTIONS = new Set(['retrieve-database'])

function shapeNotionResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) {
    return passthrough(result)
  }

  const data = result as Record<string, unknown>

  // Single database response
  if (NOTION_DATABASE_ACTIONS.has(actionName) && data.id && data.object === 'database') {
    const shaped = compactNotionDatabase(data)
    return compacted(result, shaped, 1)
  }

  // List/search responses with results[]
  if (Array.isArray(data.results)) {
    let compactResults: unknown[]

    if (NOTION_PAGE_ACTIONS.has(actionName)) {
      compactResults = (data.results as Record<string, unknown>[]).map(compactNotionPage)
    } else if (NOTION_USER_ACTIONS.has(actionName)) {
      compactResults = (data.results as Record<string, unknown>[]).map(compactNotionUser)
    } else if (NOTION_BLOCK_ACTIONS.has(actionName)) {
      compactResults = (data.results as Record<string, unknown>[]).map(compactNotionBlock)
    } else {
      // Unknown action with results[] — pass through
      return passthrough(result)
    }

    const shaped = {
      object: data.object,
      results: compactResults,
      has_more: data.has_more,
      next_cursor: data.next_cursor ?? null,
      _compact: true,
      _hint: 'Use get-page or retrieve-page with a specific page ID for full details.',
    }
    return compacted(result, shaped, compactResults.length)
  }

  return passthrough(result)
}

/* ─── Serialization helpers ───────────────────────────── */

/**
 * Build a ShaperResult for a compacted response.
 * Serializes both original and shaped once, caches the shaped JSON string
 * so the bridge doesn't re-serialize.
 */
export function compacted(original: unknown, shaped: unknown, resultCount: number): ShaperResult {
  const serialized = JSON.stringify(shaped)
  return {
    shaped,
    originalChars: JSON.stringify(original).length,
    shapedChars: serialized.length,
    compacted: true,
    resultCount,
    serialized,
  }
}

/**
 * Build a passthrough ShaperResult — no compaction, no serialization overhead.
 * originalChars/shapedChars are set lazily only when the bridge reads them
 * (for telemetry on compacted results). For passthrough we set 0 since
 * the bridge skips telemetry when compacted=false.
 */
export function passthrough(result: unknown): ShaperResult {
  return { shaped: result, originalChars: 0, shapedChars: 0, compacted: false }
}

/* ─── Provider Router ──────────────────────────────────── */

const SHAPERS: Record<string, (actionName: string, result: unknown) => ShaperResult> = {
  notion: shapeNotionResponse,
  slack: shapeSlackResponse,
  hubspot: shapeHubSpotResponse,
  twitter: shapeTwitterResponse,
  'twitter-v2': shapeTwitterResponse,
  google: shapeGoogleResponse,
  'google-calendar': shapeGoogleResponse,
  'google-sheets': shapeGoogleResponse,
  salesforce: shapeSalesforceResponse,
  zendesk: shapeZendeskResponse,
  github: shapeGitHubResponse,
  // Generic shaper for small providers
  asana: shapeGenericResponse,
  linear: shapeGenericResponse,
  intercom: shapeGenericResponse,
  airtable: shapeGenericResponse,
  calendly: shapeGenericResponse,
  aircall: shapeGenericResponse,
  jira: shapeGenericResponse,
  gong: shapeGenericResponse,
  fireflies: shapeGenericResponse,
  linkedin: shapeGenericResponse,
  'aws-iam': shapeGenericResponse,
  // Tier 2 — custom actions
  discord: shapeGenericResponse,
  instagram: shapeGenericResponse,
  facebook: shapeGenericResponse,
  reddit: shapeGenericResponse,
  tiktok: shapeGenericResponse,
  bitly: shapeGenericResponse,
  trello: shapeGenericResponse,
  typeform: shapeGenericResponse,
  whoop: shapeGenericResponse,
  heygen: shapeGenericResponse,
  paypal: shapeGenericResponse,
  canva: shapeGenericResponse,
  lemlist: shapeGenericResponse,
  amazon: shapeGenericResponse,
  // Tier 3 — automation, CRM, sales
  make: shapeGenericResponse,
  zapier: shapeGenericResponse,
  pipedrive: shapeGenericResponse,
  apollo: shapeGenericResponse,
}

/**
 * Shape an action result for compact agent consumption.
 * Returns the original result unchanged for providers without a shaper.
 */
export function shapeActionResponse(
  provider: string,
  actionName: string,
  result: unknown,
): ShaperResult {
  actionName = resolveLocalActionName(provider, actionName)
  const shaper = SHAPERS[provider]
  if (!shaper) {
    return passthrough(result)
  }
  try {
    return shaper(actionName, result)
  } catch {
    // Fail-open: if shaper throws on malformed data, return raw result
    return passthrough(result)
  }
}
